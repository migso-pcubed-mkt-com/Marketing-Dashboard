import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { CONFIG } from '../config.js';
import { Icon, StatusIcon, PriorityIcon } from './Icons.jsx';
import { dateToPixel, pixelToDate, getTaskPosition, calculateSwimLanes, getDayHeaders, getWeekHeaders } from './timeline/useTimelineHelpers.js';
import TimelineHeader from './timeline/TimelineHeader.jsx';
import TimelineBar from './timeline/TimelineBar.jsx';

const TimelineView=({categories,actions,tasks,onOpenTask,onOpenAction,onUpdateTask,onBatchUpdateTasks,onUpdateAction,onReorderAction,onAddTask,filters,setFilters,selectedYear,onYearChange,isUserInteractingRef,isReadOnly,onRequestNewTask,isCardAsTask,boardGroups})=>{
    const timelineRef=useRef(null);
    const dragGhostRef=useRef(null);
    const[zoom,setZoom]=useState('month');
    const[isPanning,setIsPanning]=useState(false);
    const[startX,setStartX]=useState(0);
    const[scrollLeft,setScrollLeft]=useState(0);
    const[spacePressed,setSpacePressed]=useState(false);
    const[resizing,setResizing]=useState(null); // {taskId, handle: 'left'|'right', startX, originalStart, originalEnd}
    const[justResized,setJustResized]=useState(false); // Prevent click after resize
    const[dragging,setDragging]=useState(null); // {taskId, task, startX, startY, originalLeft}
    const[dragOverTask,setDragOverTask]=useState(null); // {taskId, position: 'before'|'after'}
    const[dragOverAction,setDragOverAction]=useState(null); // {actionId, position: 'before'|'after'}
    const[dragOverActionRow,setDragOverActionRow]=useState(null); // actionId of row being dragged over
    const[dragPreview,setDragPreview]=useState(null); // {left, width, actionId} for preview line
    const[dropIndicator,setDropIndicator]=useState(null); // {left, actionId} for precise drop indicator
    const[centerDateRef,setCenterDateRef]=useState(null); // Reference date for scroll preservation
    const[creatingTask,setCreatingTask]=useState(null); // {actionId, startX, currentX, startDate, actionRow} for task creation
    const currentMonth=new Date().getMonth();
    // Week base: Monday on or before Jan 1 (aligns week columns to real calendar weeks)
    const jan1=new Date(selectedYear,0,1);const jan1Dow=jan1.getDay();
    const weekBase=new Date(selectedYear,0,1-(jan1Dow===0?6:jan1Dow-1));
    const now=new Date();const currentWeek=Math.floor(Math.round((Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())-Date.UTC(weekBase.getFullYear(),weekBase.getMonth(),weekBase.getDate()))/86400000)/7);

    const colWidth=zoom==='quarter'?280:zoom==='week'?40:zoom==='day'?60:100;
    const layoutParams=useMemo(()=>({zoom,colWidth,selectedYear,weekBase}),[zoom,colWidth,selectedYear,weekBase]);

    // Calculate the date at the center of the current viewport
    const getCenterDate=useCallback(()=>{
        if(!timelineRef.current)return null;
        const scrollLeft=timelineRef.current.scrollLeft;
        const viewportWidth=timelineRef.current.clientWidth;
        const centerX=scrollLeft+viewportWidth/2-250; // -250 for left column

        const year=selectedYear;
        if(zoom==='day'){
            const dayIndex=Math.floor(centerX/colWidth);
            const date=new Date(year,0,1);
            date.setDate(date.getDate()+dayIndex);
            return date;
        }else if(zoom==='week'){
            const pixelsPerDay=colWidth/7;
            const dayIndex=Math.floor(centerX/pixelsPerDay);
            const date=new Date(weekBase.getFullYear(),weekBase.getMonth(),weekBase.getDate()+dayIndex);
            return date;
        }else if(zoom==='month'){
            const monthIndex=Math.floor(centerX/colWidth);
            const monthProgress=(centerX%colWidth)/colWidth;
            const daysInMonth=new Date(year,monthIndex+1,0).getDate();
            const day=Math.floor(monthProgress*daysInMonth)+1;
            const date=new Date(year,monthIndex,day);
            return date;
        }else if(zoom==='quarter'){
            const quarterIndex=Math.floor(centerX/colWidth);
            const quarterProgress=(centerX%colWidth)/colWidth;
            const monthInQuarter=Math.floor(quarterProgress*3);
            const monthProgress=(quarterProgress*3)%1;
            const monthIndex=quarterIndex*3+monthInQuarter;
            const daysInMonth=new Date(year,monthIndex+1,0).getDate();
            const day=Math.floor(monthProgress*daysInMonth)+1;
            const date=new Date(year,monthIndex,day);
            return date;
        }
        return new Date(year,0,1);
    },[zoom,colWidth]);

    // Scroll to a specific date in the current zoom level
    const scrollToDate=useCallback((targetDate)=>{
        if(!timelineRef.current||!targetDate)return;
        const year=selectedYear;
        const month=targetDate.getMonth();
        const day=targetDate.getDate();

        let scrollPosition=0;
        if(zoom==='day'){
            const dayOfYear=Math.floor((targetDate-new Date(year,0,1))/(1000*60*60*24));
            scrollPosition=dayOfYear*colWidth;
        }else if(zoom==='week'){
            const daysFromBase=Math.round((Date.UTC(targetDate.getFullYear(),targetDate.getMonth(),targetDate.getDate())-Date.UTC(weekBase.getFullYear(),weekBase.getMonth(),weekBase.getDate()))/86400000);
            const pixelsPerDay=colWidth/7;
            scrollPosition=daysFromBase*pixelsPerDay;
        }else if(zoom==='month'){
            const daysInMonth=new Date(year,month+1,0).getDate();
            const dayProgress=(day-1)/daysInMonth;
            scrollPosition=month*colWidth+dayProgress*colWidth;
        }else if(zoom==='quarter'){
            const quarter=Math.floor(month/3);
            const monthInQuarter=month%3;
            const daysInMonth=new Date(year,month+1,0).getDate();
            const dayProgress=(day-1)/daysInMonth;
            const monthProgress=monthInQuarter/3+dayProgress/3;
            scrollPosition=quarter*colWidth+monthProgress*colWidth;
        }

        // Center the date in the viewport
        const viewportWidth=timelineRef.current.clientWidth;
        timelineRef.current.scrollLeft=scrollPosition-viewportWidth/2+250; // +250 for left column
    },[zoom,colWidth]);

    // Save center date before zoom change and restore after
    const handleZoomChange=useCallback((newZoom)=>{
        const centerDate=getCenterDate();
        setCenterDateRef(centerDate);
        setZoom(newZoom);
    },[getCenterDate]);

    // Restore scroll position when zoom changes
    useEffect(()=>{
        if(centerDateRef){
            // Small delay to ensure layout is ready
            setTimeout(()=>{
                scrollToDate(centerDateRef);
                setCenterDateRef(null);
            },0);
        }
    },[zoom,centerDateRef,scrollToDate]);

    useEffect(()=>{
        const handleKeyDown=(e)=>{if(e.code==='Space'&&!e.target.tagName.match(/INPUT|TEXTAREA/)){e.preventDefault();setSpacePressed(true);}};
        const handleKeyUp=(e)=>{if(e.code==='Space')setSpacePressed(false);};
        window.addEventListener('keydown',handleKeyDown);
        window.addEventListener('keyup',handleKeyUp);
        return()=>{window.removeEventListener('keydown',handleKeyDown);window.removeEventListener('keyup',handleKeyUp);};
    },[]);

    const handleMouseDown=(e)=>{if(!spacePressed)return;setIsPanning(true);setStartX(e.pageX-timelineRef.current.offsetLeft);setScrollLeft(timelineRef.current.scrollLeft);};
    const handleMouseMove=(e)=>{if(!isPanning)return;e.preventDefault();const x=e.pageX-timelineRef.current.offsetLeft;timelineRef.current.scrollLeft=scrollLeft-(x-startX)*2;};
    const handleMouseUp=()=>setIsPanning(false);

    const getPos=useCallback((task)=>getTaskPosition(task,layoutParams),[layoutParams]);

    const calcSwimLanes=useCallback((tasksList,resizingInfo)=>calculateSwimLanes(tasksList,resizingInfo,layoutParams),[layoutParams]);

    const d2p=useCallback((d)=>dateToPixel(d,layoutParams),[layoutParams]);
    const p2d=useCallback((absX)=>pixelToDate(absX,layoutParams),[layoutParams]);

    // Resize handlers with useCallback to avoid recreating on every render
    const startResize=useCallback((taskId,handle,clientX,task)=>{
        if(isReadOnly)return;
        document.body.classList.add('resizing');
        if(isUserInteractingRef)isUserInteractingRef.current=true;
        setResizing({
            taskId,
            handle,
            startX:clientX,
            originalStart:task.startDate,
            originalEnd:task.dueDate
        });
    },[isUserInteractingRef]);

    const endResize=useCallback(()=>{
        document.body.classList.remove('resizing');
        if(isUserInteractingRef)isUserInteractingRef.current=false;
        setResizing(null);
        setJustResized(true);
        // Reset after a short delay to allow click events to be blocked
        setTimeout(()=>setJustResized(false),100);
    },[isUserInteractingRef]);

    useEffect(()=>{
        if(!resizing)return;

        const handleGlobalMouseMove=(e)=>{
            e.preventDefault();
            const deltaX=e.clientX-resizing.startX;
            const task=tasks.find(t=>t.id===resizing.taskId);
            if(!task)return;

            // Calculate pixels per day based on zoom
            const currentColWidth=zoom==='quarter'?280:zoom==='week'?40:zoom==='day'?60:100;
            let pixelsPerDay;
            if(zoom==='day'){
                pixelsPerDay=currentColWidth; // 60px per day
            }else if(zoom==='week'){
                pixelsPerDay=currentColWidth/7; // 40px / 7 days
            }else if(zoom==='month'){
                // For month view, calculate precise pixels per day
                const avgDaysInMonth=30;
                pixelsPerDay=currentColWidth/avgDaysInMonth;
            }else if(zoom==='quarter'){
                // For quarter view: 280px per quarter, 3 months per quarter, ~30 days per month
                pixelsPerDay=currentColWidth/(3*30); // ~3.1px per day
            }else{
                pixelsPerDay=1;
            }

            // Calculate days moved with smart snap-to-grid
            let daysMoved;
            if(zoom==='week'){
                // Snap to day boundaries in week view
                daysMoved=Math.round(deltaX/pixelsPerDay);
            }else if(zoom==='month'){
                // Smart snap in month view: detect if near month boundaries
                const daysMovedRaw=deltaX/pixelsPerDay;
                const originalDate=resizing.handle==='left'?new Date(resizing.originalStart):new Date(resizing.originalEnd);
                const newDate=new Date(originalDate);
                newDate.setDate(newDate.getDate()+Math.round(daysMovedRaw));

                // Check if near start or end of month (within 5 days - increased threshold)
                const dayOfMonth=newDate.getDate();
                const daysInMonth=new Date(newDate.getFullYear(),newDate.getMonth()+1,0).getDate();
                const snapThreshold=5; // Increased from 3 to 5 days

                if(dayOfMonth<=snapThreshold){
                    // Near start of month - snap to day 1
                    daysMoved=Math.round(daysMovedRaw)-(dayOfMonth-1);
                }else if(dayOfMonth>=daysInMonth-snapThreshold){
                    // Near end of month - snap to last day
                    daysMoved=Math.round(daysMovedRaw)+(daysInMonth-dayOfMonth);
                }else{
                    // Normal snap to nearest day
                    daysMoved=Math.round(daysMovedRaw);
                }
            }else{
                daysMoved=Math.round(deltaX/pixelsPerDay);
            }

            if(daysMoved===0)return;

            const originalStart=new Date(resizing.originalStart);
            const originalEnd=new Date(resizing.originalEnd);
            let newStart=resizing.originalStart;
            let newEnd=resizing.originalEnd;

            if(resizing.handle==='left'){
                const newStartDate=new Date(originalStart);
                newStartDate.setDate(newStartDate.getDate()+daysMoved);
                if(newStartDate.getTime()<originalEnd.getTime()){
                    newStart=newStartDate.toISOString().split('T')[0];
                }
            }else{
                const newEndDate=new Date(originalEnd);
                newEndDate.setDate(newEndDate.getDate()+daysMoved);
                if(newEndDate.getTime()>originalStart.getTime()){
                    newEnd=newEndDate.toISOString().split('T')[0];
                }
            }

            if(newStart!==task.startDate||newEnd!==task.dueDate){
                onUpdateTask(resizing.taskId,{startDate:newStart,dueDate:newEnd});
            }
        };

        const handleGlobalMouseUp=()=>{
            endResize();
        };

        const handleGlobalTouchMove=(e)=>{
            e.preventDefault();
            const deltaX=e.touches[0].clientX-resizing.startX;
            const task=tasks.find(t=>t.id===resizing.taskId);
            if(!task)return;

            // Calculate pixels per day based on zoom
            const currentColWidth=zoom==='quarter'?280:zoom==='week'?40:zoom==='day'?60:100;
            let pixelsPerDay;
            if(zoom==='day'){
                pixelsPerDay=currentColWidth; // 60px per day
            }else if(zoom==='week'){
                pixelsPerDay=currentColWidth/7; // 40px / 7 days
            }else if(zoom==='month'){
                // For month view, calculate precise pixels per day
                const avgDaysInMonth=30;
                pixelsPerDay=currentColWidth/avgDaysInMonth;
            }else if(zoom==='quarter'){
                // For quarter view: 280px per quarter, 3 months per quarter, ~30 days per month
                pixelsPerDay=currentColWidth/(3*30); // ~3.1px per day
            }else{
                pixelsPerDay=1;
            }

            // Calculate days moved with smart snap-to-grid
            let daysMoved;
            if(zoom==='week'){
                // Snap to day boundaries in week view
                daysMoved=Math.round(deltaX/pixelsPerDay);
            }else if(zoom==='month'){
                // Smart snap in month view: detect if near month boundaries
                const daysMovedRaw=deltaX/pixelsPerDay;
                const originalDate=resizing.handle==='left'?new Date(resizing.originalStart):new Date(resizing.originalEnd);
                const newDate=new Date(originalDate);
                newDate.setDate(newDate.getDate()+Math.round(daysMovedRaw));

                // Check if near start or end of month (within 5 days - increased threshold)
                const dayOfMonth=newDate.getDate();
                const daysInMonth=new Date(newDate.getFullYear(),newDate.getMonth()+1,0).getDate();
                const snapThreshold=5; // Increased from 3 to 5 days

                if(dayOfMonth<=snapThreshold){
                    // Near start of month - snap to day 1
                    daysMoved=Math.round(daysMovedRaw)-(dayOfMonth-1);
                }else if(dayOfMonth>=daysInMonth-snapThreshold){
                    // Near end of month - snap to last day
                    daysMoved=Math.round(daysMovedRaw)+(daysInMonth-dayOfMonth);
                }else{
                    // Normal snap to nearest day
                    daysMoved=Math.round(daysMovedRaw);
                }
            }else{
                daysMoved=Math.round(deltaX/pixelsPerDay);
            }

            if(daysMoved===0)return;

            const originalStart=new Date(resizing.originalStart);
            const originalEnd=new Date(resizing.originalEnd);
            let newStart=resizing.originalStart;
            let newEnd=resizing.originalEnd;

            if(resizing.handle==='left'){
                const newStartDate=new Date(originalStart);
                newStartDate.setDate(newStartDate.getDate()+daysMoved);
                if(newStartDate.getTime()<originalEnd.getTime()){
                    newStart=newStartDate.toISOString().split('T')[0];
                }
            }else{
                const newEndDate=new Date(originalEnd);
                newEndDate.setDate(newEndDate.getDate()+daysMoved);
                if(newEndDate.getTime()>originalStart.getTime()){
                    newEnd=newEndDate.toISOString().split('T')[0];
                }
            }

            if(newStart!==task.startDate||newEnd!==task.dueDate){
                onUpdateTask(resizing.taskId,{startDate:newStart,dueDate:newEnd});
            }
        };

        const handleGlobalTouchEnd=()=>{
            endResize();
        };

        document.addEventListener('mousemove',handleGlobalMouseMove);
        document.addEventListener('mouseup',handleGlobalMouseUp);
        document.addEventListener('touchmove',handleGlobalTouchMove,{passive:false});
        document.addEventListener('touchend',handleGlobalTouchEnd);

        return()=>{
            document.removeEventListener('mousemove',handleGlobalMouseMove);
            document.removeEventListener('mouseup',handleGlobalMouseUp);
            document.removeEventListener('touchmove',handleGlobalTouchMove);
            document.removeEventListener('touchend',handleGlobalTouchEnd);
        };
    },[resizing,tasks,onUpdateTask,zoom,endResize]);

    // Centralized drag state cleanup (called from all drop/dragend paths)
    const cleanUpDragState=()=>{
        setDragging(null);
        setDragOverTask(null);
        setDragOverActionRow(null);
        setDragPreview(null);
        setDropIndicator(null);
        document.body.classList.remove('task-dragging');
        document.querySelectorAll('.dragging').forEach(el=>el.classList.remove('dragging'));
        document.querySelectorAll('.drag-over,.action-row-drag-over').forEach(el=>{
            el.classList.remove('drag-over','action-row-drag-over');
        });
        if(isUserInteractingRef)isUserInteractingRef.current=false;
    };

    // Safety net: catch dragend on document in case React unmounts the dragged element
    useEffect(()=>{
        if(!dragging)return;
        const handleGlobalDragEnd=()=>{
            cleanUpDragState();
        };
        document.addEventListener('dragend',handleGlobalDragEnd);
        return()=>document.removeEventListener('dragend',handleGlobalDragEnd);
    },[dragging]);

    // Drag & Drop handlers for horizontal drag (date change)
    const handleTaskDragStart=(e,task)=>{
        // Don't start drag if we're resizing or in read-only mode
        if(isReadOnly||resizing){
            e.preventDefault();
            return;
        }
        e.stopPropagation();
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('taskId',task.id);
        e.dataTransfer.setData('text/plain',task.id); // Fallback for compatibility

        // Use minimal invisible ghost — the preview line is the real indicator
        const ghost=document.createElement('div');
        ghost.style.cssText='position:absolute;top:-1000px;width:1px;height:1px;opacity:0.01;';
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost,0,0);
        setTimeout(()=>document.body.removeChild(ghost),0);
        const pos=getPos(task);
        const grabOffset=e.clientX-e.currentTarget.getBoundingClientRect().left;

        setDragging({taskId:task.id,task:task,startX:e.clientX,startY:e.clientY,originalLeft:pos?.left||0,grabOffset:grabOffset||0});
        if(isUserInteractingRef)isUserInteractingRef.current=true;
        e.currentTarget.classList.add('dragging');
        document.body.classList.add('task-dragging');
    };

    const handleTaskDragEnd=(e)=>{
        e.currentTarget.classList.remove('dragging');
        cleanUpDragState();
    };

    const handleTaskDragOver=(e,task)=>{
        e.preventDefault();
        // If this is the task being dragged, let event bubble to action row
        if(dragging&&dragging.taskId===task.id)return;
        e.stopPropagation();

        // Determine if drag is in top or bottom half of task
        const rect=e.currentTarget.getBoundingClientRect();
        const midY=rect.top+rect.height/2;
        const position=e.clientY<midY?'before':'after';
        setDragOverTask({taskId:task.id,position});
    };

    const handleTaskDragLeave=(e)=>{
        // If this is the task being dragged, let event bubble
        if(dragging&&e.currentTarget.classList.contains('dragging'))return;
        e.stopPropagation();
        setDragOverTask(null);
    };

    const handleTaskDrop=(e,targetTask)=>{
        // If dropping on the task being dragged, let event bubble to action row
        if(dragging&&dragging.taskId===targetTask.id)return;
        e.preventDefault();
        e.stopPropagation();
        const draggedId=e.dataTransfer.getData('taskId');
        if(!draggedId||draggedId===targetTask.id){
            setDragOverTask(null);
            return;
        }

        const draggedTask=tasks.find(t=>t.id===draggedId);
        if(!draggedTask||!targetTask)return;

        // If tasks are in the same action, reorder them
        if(draggedTask.actionId===targetTask.actionId){
            // Get all tasks in this action sorted by order
            const actionTasks=tasks.filter(t=>t.actionId===targetTask.actionId).sort((a,b)=>(a.order||0)-(b.order||0));
            const draggedIndex=actionTasks.findIndex(t=>t.id===draggedId);
            const targetIndex=actionTasks.findIndex(t=>t.id===targetTask.id);

            if(draggedIndex!==-1&&targetIndex!==-1){
                // Reorder
                const reordered=[...actionTasks];
                const[removed]=reordered.splice(draggedIndex,1);
                const insertIndex=dragOverTask?.position==='before'?targetIndex:targetIndex+1;
                const adjustedIndex=draggedIndex<targetIndex?insertIndex-1:insertIndex;
                reordered.splice(adjustedIndex,0,removed);

                // Update order property
                const updates=reordered.map((t,idx)=>({id:t.id,order:idx}));
                updates.forEach(({id,order})=>onUpdateTask(id,{order}));
            }
        }else{
            // Move task to different action - preserve start/due dates
            onUpdateTask(draggedId,{
                actionId:targetTask.actionId,
                order:targetTask.order||0,
                startDate:draggedTask.startDate,
                dueDate:draggedTask.dueDate
            });
        }

        cleanUpDragState();
    };

    // Drag & Drop handlers for actions
    const handleActionDragOver=(e,action)=>{
        if(!onReorderAction)return;

        // Check if this is an action drag (not a task drag)
        // We check for 'actionid' in types (HTML5 DnD normalizes to lowercase)
        const types=Array.from(e.dataTransfer.types||[]).map(t=>t.toLowerCase());
        const hasActionId=types.includes('actionid');

        if(!hasActionId){
            return; // This is a task drag, ignore it
        }

        e.preventDefault();
        e.stopPropagation();

        // Determine if drag is in top or bottom half of action row
        const rect=e.currentTarget.getBoundingClientRect();
        const midY=rect.top+rect.height/2;
        const position=e.clientY<midY?'before':'after';
        setDragOverAction({actionId:action.id,position});
    };

    const handleActionDragLeave=(e)=>{
        e.stopPropagation();
        // Only clear if we're actually leaving the action row
        const relatedTarget=e.relatedTarget;
        if(!relatedTarget||!e.currentTarget.contains(relatedTarget)){
            setDragOverAction(null);
        }
    };

    const handleActionDrop=(e,targetAction)=>{
        // Check if this is an action drag (not a task drag)
        // We check for 'actionid' in types (HTML5 DnD normalizes to lowercase)
        const types=Array.from(e.dataTransfer.types||[]).map(t=>t.toLowerCase());
        const hasActionId=types.includes('actionid');

        if(!hasActionId){
            return; // This is a task drag, let it be handled by task handlers
        }

        e.preventDefault();
        e.stopPropagation();

        // Only handle action drops, not task drops
        const draggedId=e.dataTransfer.getData('actionId');
        if(!draggedId){
            return;
        }

        if(draggedId===targetAction.id){
            setDragOverAction(null);
            return;
        }

        if(onReorderAction&&dragOverAction){
            onReorderAction(draggedId,targetAction.id,dragOverAction.position);
        }

        setDragOverAction(null);
    };

    const weekHeadersCache=zoom==='week'?getWeekHeaders(selectedYear,weekBase):null;
    const dayHeadersCache=zoom==='day'?getDayHeaders(selectedYear):null;
    const headers=zoom==='quarter'?[{q:1,label:'Q1',months:[0,1,2]},{q:2,label:'Q2',months:[3,4,5]},{q:3,label:'Q3',months:[6,7,8]},{q:4,label:'Q4',months:[9,10,11]}]:zoom==='week'?weekHeadersCache.weeks:zoom==='day'?dayHeadersCache.days:CONFIG.MONTHS.map((m,i)=>({month:i,label:m}));
    const monthHeaders=zoom==='week'?weekHeadersCache.months:zoom==='day'?dayHeadersCache.months:null;
    const monthBoundaryLines=zoom==='week'?(weekHeadersCache.monthBoundaries||[]):[];

    const filteredTasks=tasks.filter(t=>{
        const action=actions.find(a=>a.id===t.actionId);
        if(selectedYear){
            const taskStartYear=t.startDate?new Date(t.startDate).getFullYear():null;
            const taskEndYear=t.dueDate?new Date(t.dueDate).getFullYear():null;
            // Show task if its date range overlaps the selected year
            if(taskStartYear&&taskStartYear>selectedYear)return false;
            if(taskEndYear&&taskEndYear<selectedYear)return false;
            if(taskStartYear&&!taskEndYear&&taskStartYear!==selectedYear)return false;
        }
        if(filters?.search&&!t.title.toLowerCase().includes(filters.search.toLowerCase()))return false;
        if(filters?.status.length>0&&!filters.status.includes(t.status))return false;
        if(filters?.priority.length>0&&!filters.priority.includes(t.priority))return false;
        if(filters?.category.length>0&&action&&!filters.category.includes(action.categoryId))return false;
        if(filters?.channel.length>0){
            const taskChannels=t.channels||action?.tags||[];
            if(!filters.channel.some(c=>taskChannels.includes(c)))return false;
        }
        if(filters?.country&&filters.country.length>0){
            const taskCountries=t.countries||[];
            if(!filters.country.some(c=>taskCountries.includes(c)))return false;
        }
        if(filters?.otherLabel&&filters.otherLabel.length>0&&!(t.otherLabels||[]).some(l=>filters.otherLabel.includes(l.id)))return false;
        if(filters?.member&&filters.member.length>0&&!(t.assignees||[]).some(m=>filters.member.includes(m)))return false;
        return true;
    });

    const groupedByCategory=categories.map(cat=>{
        const catActions=actions.filter(a=>a.categoryId===cat.id).map(action=>({action,tasks:filteredTasks.filter(t=>t.actionId===action.id)}));
        return{category:cat,actions:catActions};
    }).filter(g=>g.actions.length>0);
    // Combined view: reorder categories so those from the same source board cluster
    // together. The render loop reads _sourceBoardId to insert group banners.
    if(boardGroups && boardGroups.length > 0){
        const boardOrder=new Map(boardGroups.map((g,i)=>[g.boardId,i]));
        groupedByCategory.sort((a,b)=>{
            const ai=boardOrder.has(a.category._sourceBoardId)?boardOrder.get(a.category._sourceBoardId):999;
            const bi=boardOrder.has(b.category._sourceBoardId)?boardOrder.get(b.category._sourceBoardId):999;
            return ai-bi;
        });
    }
    const scrollToQuarter=(q)=>{scrollToDate(new Date(selectedYear,(q-1)*3,1));};

    const handleDrop=(e,colIdx)=>{
        e.preventDefault();e.currentTarget.classList.remove('drag-over');
        const taskId=e.dataTransfer.getData('taskId');
        if(taskId&&onUpdateTask){
            const task=tasks.find(t=>t.id===taskId);
            if(!task)return;

            const year=selectedYear;

            // Calculate task duration in days
            let duration=1; // default 1 day
            if(task.startDate&&task.dueDate){
                const oldStart=new Date(task.startDate);
                const oldEnd=new Date(task.dueDate);
                duration=Math.max(1,Math.ceil((oldEnd-oldStart)/(1000*60*60*24))+1);
            }

            // Get position within column based on mouse position
            const rect=e.currentTarget.getBoundingClientRect();
            const relativeX=e.clientX-rect.left;
            let percentage=relativeX/rect.width;

            let startDate,dueDate;

            if(zoom==='week'){
                // For week view: snap to half-day boundaries for better precision (14 slots per week)
                const weekNumber=colIdx;

                // Calculate which half-day of the week based on percentage
                // 7 days * 2 half-days = 14 slots per week
                let halfDaySlot=Math.round(percentage*14);

                // Clamp to valid range [0-13] and ensure task fits in week
                const durationInHalfDays=duration*2;
                halfDaySlot=Math.max(0,Math.min(14-durationInHalfDays,halfDaySlot));

                // Convert half-day slot to day
                const dayOfWeek=Math.floor(halfDaySlot/2);

                // Calculate the actual date (from Monday-aligned weekBase)
                const daysOffset=weekNumber*7+dayOfWeek;
                const newStartDate=new Date(weekBase.getFullYear(),weekBase.getMonth(),weekBase.getDate()+daysOffset);

                // Calculate end date
                const newEndDate=new Date(newStartDate);
                newEndDate.setDate(newEndDate.getDate()+duration-1);

                startDate=newStartDate.getFullYear()+'-'+String(newStartDate.getMonth()+1).padStart(2,'0')+'-'+String(newStartDate.getDate()).padStart(2,'0');
                dueDate=newEndDate.getFullYear()+'-'+String(newEndDate.getMonth()+1).padStart(2,'0')+'-'+String(newEndDate.getDate()).padStart(2,'0');

            }else if(zoom==='day'){
                // For day view: direct day-to-day placement (always snaps to full days)
                // FIXED: Limit dayOfYear to valid range (0-364 for 2026)
                const maxDaysInYear=365; // 2026 is not a leap year
                const dayOfYear=Math.max(0,Math.min(maxDaysInYear-1,colIdx)); // colIdx is the day index (0-364)

                // Calculate the actual date
                const newStartDate=new Date(year,0,1);
                newStartDate.setDate(newStartDate.getDate()+dayOfYear);

                // Calculate end date - ensure it doesn't go beyond year
                const newEndDate=new Date(newStartDate);
                newEndDate.setDate(newEndDate.getDate()+duration-1);

                // If end date exceeds current year, clamp it to end of year
                if(newEndDate.getFullYear()>year){
                    newEndDate.setFullYear(year);
                    newEndDate.setMonth(11);
                    newEndDate.setDate(31);
                }

                startDate=newStartDate.getFullYear()+'-'+String(newStartDate.getMonth()+1).padStart(2,'0')+'-'+String(newStartDate.getDate()).padStart(2,'0');
                dueDate=newEndDate.getFullYear()+'-'+String(newEndDate.getMonth()+1).padStart(2,'0')+'-'+String(newEndDate.getDate()).padStart(2,'0');

            }else if(zoom==='month'){
                // For month view: snap to full days (daily precision)
                const monthIdx=colIdx;
                const daysInMonth=new Date(year,monthIdx+1,0).getDate();

                // Calculate target day based on percentage - always round to nearest full day
                let targetDay=Math.round(percentage*daysInMonth);
                targetDay=Math.max(1,Math.min(daysInMonth,targetDay));

                // Ensure task fits within available space
                let startDay=Math.max(1,Math.min(daysInMonth-duration+1,targetDay));

                startDate=year+'-'+String(monthIdx+1).padStart(2,'0')+'-'+String(startDay).padStart(2,'0');

                // Calculate end date
                const newStartDate=new Date(year,monthIdx,startDay);
                const newEndDate=new Date(newStartDate);
                newEndDate.setDate(newEndDate.getDate()+duration-1);

                const endMonth=newEndDate.getMonth();
                const endDay=newEndDate.getDate();
                dueDate=year+'-'+String(endMonth+1).padStart(2,'0')+'-'+String(endDay).padStart(2,'0');

            }else{
                // Quarter view: colIdx is quarter index (0-3)
                const quarterIdx=colIdx;
                const firstMonthOfQuarter=quarterIdx*3;

                let monthIdx,monthPercentage;

                if(percentage===0){
                    monthIdx=firstMonthOfQuarter;
                    monthPercentage=0;
                }else if(percentage===1){
                    monthIdx=firstMonthOfQuarter+2;
                    monthPercentage=1;
                }else if(percentage===0.5){
                    monthIdx=firstMonthOfQuarter+1;
                    monthPercentage=0.5;
                }else{
                    // Determine which month within the quarter based on percentage
                    let monthInQuarter=Math.floor(percentage*3);
                    if(monthInQuarter>2)monthInQuarter=2;
                    monthIdx=firstMonthOfQuarter+monthInQuarter;
                    monthPercentage=(percentage*3)%1;
                }

                const daysInMonth=new Date(year,monthIdx+1,0).getDate();
                let startDay;

                if(monthPercentage===0){
                    startDay=1;
                }else if(monthPercentage===1){
                    startDay=Math.max(1,daysInMonth-duration+1);
                }else if(monthPercentage===0.5){
                    startDay=Math.max(1,Math.min(daysInMonth-duration+1,Math.floor((daysInMonth-duration+1)/2)+1));
                }else{
                    startDay=Math.max(1,Math.min(daysInMonth-duration+1,Math.round(monthPercentage*daysInMonth)));
                }

                startDate=year+'-'+String(monthIdx+1).padStart(2,'0')+'-'+String(startDay).padStart(2,'0');

                const newStartDate=new Date(year,monthIdx,startDay);
                const newEndDate=new Date(newStartDate);
                newEndDate.setDate(newEndDate.getDate()+duration-1);

                const endMonth=newEndDate.getMonth();
                const endDay=newEndDate.getDate();
                dueDate=year+'-'+String(endMonth+1).padStart(2,'0')+'-'+String(endDay).padStart(2,'0');
            }

            onUpdateTask(taskId,{startDate,dueDate});
        }
    };
    const handleDragOver=(e)=>{e.preventDefault();e.currentTarget.classList.add('drag-over');};
    const handleDragLeave=(e)=>{e.currentTarget.classList.remove('drag-over');};

    // Handler for dropping a task into an action row — uses same pixelToDate as preview for perfect match
    const handleActionRowDrop=(e,targetAction)=>{
        e.preventDefault();
        e.stopPropagation();

        // Measure the gesture in both axes. Vertical delta > VERTICAL_PIN_THRESHOLD
        // pins to the lane under the cursor. Horizontal delta < HORIZONTAL_NOOP_THRESHOLD
        // means the user didn't intend to reschedule → keep the original dates so a
        // clean vertical drag doesn't drift the task's timeline (drag DOWN bug).
        const VERTICAL_PIN_THRESHOLD=8;
        const HORIZONTAL_NOOP_THRESHOLD=10;
        const deltaY=dragging?.startY!=null?Math.abs(e.clientY-dragging.startY):0;
        const deltaX=dragging?.startX!=null?Math.abs(e.clientX-dragging.startX):0;
        const verticallyMoved=deltaY>VERTICAL_PIN_THRESHOLD;
        const horizontallyMoved=deltaX>HORIZONTAL_NOOP_THRESHOLD;

        cleanUpDragState();

        const taskId=e.dataTransfer.getData('taskId');
        if(!taskId||!onUpdateTask)return;

        const draggedTask=tasks.find(t=>t.id===taskId);
        if(!draggedTask)return;

        const rect=e.currentTarget.getBoundingClientRect();
        // getBoundingClientRect already accounts for parent scroll — no scrollOffset needed
        const absX=e.clientX-rect.left;
        const mouseY=e.clientY-rect.top;

        let duration=1;
        if(draggedTask.startDate&&draggedTask.dueDate){
            const oldStart=new Date(draggedTask.startDate);
            const oldEnd=new Date(draggedTask.dueDate);
            duration=Math.max(1,Math.ceil((oldEnd-oldStart)/(1000*60*60*24))+1);
        }

        // Dates: if the drag is almost purely vertical, preserve the original
        // schedule. Otherwise snap to the cursor's X position like before.
        let startDate,dueDate;
        if(!horizontallyMoved&&draggedTask.startDate&&draggedTask.dueDate){
            startDate=draggedTask.startDate;
            dueDate=draggedTask.dueDate;
        }else{
            const adjustedX=absX-(dragging?.grabOffset||0);
            const snapDate=p2d(adjustedX);
            const endDate=new Date(snapDate);
            endDate.setDate(endDate.getDate()+duration-1);
            const fmt=(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
            startDate=fmt(snapDate);
            dueDate=fmt(endDate);
        }

        // swimLane is a *preference*. When the user drops ON TOP of an existing
        // task that temporally overlaps the dragged task, we push the occupants
        // of the target lane so the drop behaves like a swap/insert.
        // Direction matters:
        //   - drag DOWN (dragStartLane < targetLane) → displaced task takes the
        //     dragged task's previous lane (true swap, no empty hole).
        //   - drag UP (dragStartLane > targetLane) → displaced task shifts +1
        //     (the dragged task's previous lane stays naturally filled by gravity).
        const targetLane=Math.max(0,Math.floor((mouseY-8)/34));
        const sameAction=draggedTask.actionId===targetAction.id;

        // Pre-drag rendered lane of the dragged task (with the task still in place).
        // We need this to know whether the user is moving DOWN or UP within the action.
        let dragStartLane=0;
        if(sameAction){
            const actionTasksAll=tasks.filter(t=>t.actionId===targetAction.id);
            const{swimLanes:preDragLanes}=calculateSwimLanes(actionTasksAll,null,layoutParams);
            dragStartLane=preDragLanes[taskId]??(draggedTask.swimLane||0);
        }
        const draggingDown=sameAction && dragStartLane < targetLane;

        // Compute displaced tasks: same target action, currently rendered at
        // targetLane, temporally overlapping the dragged task's NEW span.
        // Uses calculateSwimLanes on the sibling-only view to know where each
        // existing task would render after the dragged task leaves its lane.
        const computeDisplaced=()=>{
            if(!verticallyMoved)return[];
            const draggedNew={...draggedTask,startDate,dueDate};
            const draggedPos=getTaskPosition(draggedNew,layoutParams);
            if(!draggedPos)return[];
            const dStart=draggedPos.left;
            const dEnd=draggedPos.left+draggedPos.width;
            const siblings=tasks.filter(t=>t.actionId===targetAction.id&&t.id!==taskId);
            const{swimLanes:rendered}=calculateSwimLanes(siblings,null,layoutParams);
            const out=[];
            for(const t of siblings){
                if((rendered[t.id]??-1)!==targetLane)continue;
                const pos=getTaskPosition(t,layoutParams);
                if(!pos)continue;
                if(dStart<pos.left+pos.width&&dEnd>pos.left)out.push({id:t.id,renderedLane:rendered[t.id]});
            }
            return out;
        };

        const displaced=computeDisplaced();

        if(displaced.length>0&&onBatchUpdateTasks){
            // Atomic batch: dragged task takes targetLane, displaced tasks
            // either drop into the dragged task's old lane (drag DOWN = true swap)
            // or shift +1 (drag UP / cross-action = insert).
            const baseChanges={startDate,dueDate,swimLane:targetLane};
            const draggedChanges=sameAction?baseChanges:{
                ...baseChanges,
                actionId:targetAction.id,
                order:(() => {
                    const actionTasks=tasks.filter(t=>t.actionId===targetAction.id);
                    return actionTasks.length>0?Math.max(...actionTasks.map(t=>t.order||0))+1:1;
                })()
            };
            const displacedLane=draggingDown?dragStartLane:null; // null → +1 fallback
            const updates=[
                {id:taskId,changes:draggedChanges},
                ...displaced.map(d=>({id:d.id,changes:{swimLane:displacedLane!==null?displacedLane:d.renderedLane+1}}))
            ];
            onBatchUpdateTasks(updates);
        }else if(sameAction){
            const update={startDate,dueDate};
            if(verticallyMoved) update.swimLane=targetLane;
            onUpdateTask(taskId,update);
        }else{
            const actionTasks=tasks.filter(t=>t.actionId===targetAction.id);
            const maxOrder=actionTasks.length>0?Math.max(...actionTasks.map(t=>t.order||0)):0;
            const update={actionId:targetAction.id,order:maxOrder+1,startDate,dueDate,swimLane:verticallyMoved?targetLane:undefined};
            onUpdateTask(taskId,update);
        }
    };

    const handleActionRowDragOver=(e,targetAction)=>{
        e.preventDefault();
        e.stopPropagation();

        const types=Array.from(e.dataTransfer.types||[]).map(t=>t.toLowerCase());
        const hasActionId=types.includes('actionid');
        const hasTaskId=types.includes('taskid');

        if(hasActionId||!hasTaskId){return;}

        setDragOverActionRow(targetAction.id);

        if(dragging&&dragging.task){
            const rect=e.currentTarget.getBoundingClientRect();
            // getBoundingClientRect already accounts for parent scroll — no scrollOffset needed
            const absX=e.clientX-rect.left;
            const task=dragging.task;

            if(task.startDate&&task.dueDate){
                const oldStart=new Date(task.startDate);
                const oldEnd=new Date(task.dueDate);
                const duration=Math.max(1,Math.ceil((oldEnd-oldStart)/(1000*60*60*24))+1);

                // Apply grab offset so the task stays "attached" at the grab point
                const adjustedX=absX-(dragging.grabOffset||0);
                const snapDate=p2d(adjustedX);

                const endDate=new Date(snapDate);
                endDate.setDate(endDate.getDate()+duration-1);

                const dayAfterEnd=new Date(endDate);
                dayAfterEnd.setDate(dayAfterEnd.getDate()+1);
                const previewLeft=d2p(snapDate);
                const previewWidth=Math.max(d2p(dayAfterEnd)-previewLeft,20);

                // Use mouse Y position to determine preview lane, capped to existing lanes
                // This prevents rows from expanding during drag
                const targetTasks=tasks.filter(t=>t.actionId===targetAction.id);
                const{maxLanes:actionMaxLanes}=calcSwimLanes(targetTasks,resizing);
                const mouseY=e.clientY-rect.top;
                const previewLane=Math.min(Math.max(0,Math.floor((mouseY-8)/34)),Math.max(actionMaxLanes-1,0));
                const previewTop=8+previewLane*34;

                // Get task bar color for preview
                const channels=task.channels||actions.find(a=>a.id===task.actionId)?.tags||[];
                const mainCh=channels[0]||'';
                const chColors={social:'#60a5fa',gads:'#fbbf24',lads:'#818cf8',events:'#f472b6',seo:'#4ade80',press:'#c4b5fd',email:'#fbbf24',web:'#818cf8',video:'#f87171',lp:'#2dd4bf',ia:'#c4b5fd',auto:'#fb923c'};
                const barColor=chColors[mainCh]||CONFIG.STATUSES.find(s=>s.id===task.status)?.color||'#94a3b8';

                setDragPreview({left:previewLeft,width:previewWidth,top:previewTop,actionId:targetAction.id,color:barColor});
                setDropIndicator({left:previewLeft,actionId:targetAction.id});
            }
        }
    };

    const handleActionRowDragLeave=(e,targetAction)=>{
        const relatedTarget=e.relatedTarget;
        if(!relatedTarget||!e.currentTarget.contains(relatedTarget)){
            if(dragOverActionRow===targetAction.id){
                setDragOverActionRow(null);
                setDragPreview(null);
                setDropIndicator(null);
            }
        }
    };

    // Task creation handlers
    const handleCreateTaskStart=(e,action)=>{
        // Don't start if clicking on an existing task or if space is pressed or read-only
        if(isReadOnly||e.target.closest('.timeline-bar')||spacePressed||resizing||dragging)return;

        const rect=e.currentTarget.getBoundingClientRect();
        const startX=e.clientX-rect.left;

        setCreatingTask({
            actionId:action.id,
            startX,
            currentX:startX,
            actionRow:e.currentTarget
        });
    };

    const createTaskAtPosition=(actionId,startX,endX)=>{
        const year=selectedYear;
        let startDate,dueDate;
        const fmt=(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');

        // Calculate dates based on zoom and position
        if(zoom==='day'){
            const startDay=Math.floor(startX/colWidth);
            const endDay=Math.floor(endX/colWidth);
            startDate=fmt(new Date(year,0,1+startDay));
            dueDate=fmt(new Date(year,0,1+endDay));
        }else if(zoom==='week'){
            const pixelsPerDay=colWidth/7;
            const startDay=Math.floor(startX/pixelsPerDay);
            const endDay=Math.floor(endX/pixelsPerDay);
            // DST-safe: use Date constructor with day addition instead of timestamp arithmetic
            startDate=fmt(new Date(weekBase.getFullYear(),weekBase.getMonth(),weekBase.getDate()+startDay));
            dueDate=fmt(new Date(weekBase.getFullYear(),weekBase.getMonth(),weekBase.getDate()+endDay));
        }else if(zoom==='month'){
            const startMonth=Math.floor(startX/colWidth);
            const endMonth=Math.floor(endX/colWidth);
            const startMonthProgress=(startX%colWidth)/colWidth;
            const endMonthProgress=(endX%colWidth)/colWidth;

            const daysInStartMonth=new Date(year,startMonth+1,0).getDate();
            const daysInEndMonth=new Date(year,endMonth+1,0).getDate();
            const startDay=Math.max(1,Math.floor(startMonthProgress*daysInStartMonth)+1);
            const endDay=Math.max(1,Math.floor(endMonthProgress*daysInEndMonth)+1);

            startDate=`${year}-${String(startMonth+1).padStart(2,'0')}-${String(startDay).padStart(2,'0')}`;
            dueDate=`${year}-${String(endMonth+1).padStart(2,'0')}-${String(endDay).padStart(2,'0')}`;
        }else if(zoom==='quarter'){
            const startQuarter=Math.floor(startX/colWidth);
            const endQuarter=Math.floor(endX/colWidth);
            const startQuarterProgress=(startX%colWidth)/colWidth;
            const endQuarterProgress=(endX%colWidth)/colWidth;

            const startMonthInQuarter=Math.floor(startQuarterProgress*3);
            const endMonthInQuarter=Math.floor(endQuarterProgress*3);
            const startMonth=startQuarter*3+startMonthInQuarter;
            const endMonth=endQuarter*3+endMonthInQuarter;

            const startMonthProgress=(startQuarterProgress*3)%1;
            const endMonthProgress=(endQuarterProgress*3)%1;

            const daysInStartMonth=new Date(year,startMonth+1,0).getDate();
            const daysInEndMonth=new Date(year,endMonth+1,0).getDate();
            const startDay=Math.max(1,Math.floor(startMonthProgress*daysInStartMonth)+1);
            const endDay=Math.max(1,Math.floor(endMonthProgress*daysInEndMonth)+1);

            startDate=`${year}-${String(startMonth+1).padStart(2,'0')}-${String(startDay).padStart(2,'0')}`;
            dueDate=`${year}-${String(endMonth+1).padStart(2,'0')}-${String(endDay).padStart(2,'0')}`;
        }

        // Open the NewTaskModal with pre-populated dates and action
        if(onRequestNewTask){
            onRequestNewTask({actionId,startDate,dueDate});
        }else if(onAddTask){
            onAddTask(actionId,startDate,dueDate);
        }
    };

    // Global mouse handlers for task creation
    useEffect(()=>{
        if(!creatingTask)return;

        const handleGlobalMouseMove=(e)=>{
            if(!creatingTask)return;
            const rect=creatingTask.actionRow.getBoundingClientRect();
            const currentX=Math.max(0,e.clientX-rect.left);
            setCreatingTask({...creatingTask,currentX});
        };

        const handleGlobalMouseUp=(e)=>{
            if(!creatingTask)return;
            const minDragDistance=30;
            const dragDistance=Math.abs(creatingTask.currentX-creatingTask.startX);

            // Only create task if drag distance is significant (prevent accidental clicks)
            if(dragDistance>=minDragDistance){
                const startX=Math.min(creatingTask.startX,creatingTask.currentX);
                const endX=Math.max(creatingTask.startX,creatingTask.currentX);
                createTaskAtPosition(creatingTask.actionId,startX,endX);
            }
            setCreatingTask(null);
        };

        document.addEventListener('mousemove',handleGlobalMouseMove);
        document.addEventListener('mouseup',handleGlobalMouseUp);

        return()=>{
            document.removeEventListener('mousemove',handleGlobalMouseMove);
            document.removeEventListener('mouseup',handleGlobalMouseUp);
        };
    },[creatingTask,colWidth]);

    return(
        <div className="animate-slide-in">
            <div className="timeline-container">
                <TimelineHeader zoom={zoom} selectedYear={selectedYear} onZoomChange={handleZoomChange} onScrollToQuarter={scrollToQuarter} onYearChange={onYearChange}/>
                <div ref={timelineRef} className={`overflow-x-scroll ${spacePressed?'cursor-grab':''} ${isPanning?'cursor-grabbing':''}`} style={{scrollbarWidth:'thin',overflowX:'scroll',flex:1,overflowY:'auto'}} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
                    <div style={{minWidth:`${headers.length*colWidth+250}px`,position:'relative'}}>
                        {(zoom==='week'||zoom==='day')&&monthHeaders&&(
                            <div className={`flex border-b border-[var(--border)] sticky top-0 z-40 bg-[var(--bg-primary)]`}>
                                <div className={`w-[250px] flex-shrink-0 sticky left-0 z-30 bg-[var(--bg-primary)]`}/>
                                {monthHeaders.map((m,idx)=>(
                                    <div key={idx} className={`flex-shrink-0 p-2 text-center font-semibold border-l border-[var(--border)] ${m.month===currentMonth?'bg-accent/10 text-accent':''}`} style={{width:zoom==='week'?(m.endWeek-m.startWeek)*colWidth:m.days*colWidth}}>
                                        {m.label}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className={`flex border-b border-[var(--border)] ${(zoom==='week'||zoom==='day')?'sticky top-[37px] z-30':'sticky top-0 z-40'} bg-[var(--bg-primary)] relative`}>
                            <div className={`w-[250px] flex-shrink-0 p-3 font-semibold text-sm sticky left-0 bg-[var(--bg-primary)] border-r border-[var(--border)]`} style={{zIndex:2}}>Actions</div>
                            {zoom==='quarter'?headers.map(h=>(
                                <div key={h.q} className={`flex-shrink-0 p-3 text-center font-semibold border-l border-[var(--border)]`} style={{width:colWidth}}>
                                    <div>{h.label}</div>
                                    <div className="flex justify-around text-xs text-[var(--text-muted)] mt-1">{h.months.map(m=><span key={m}>{CONFIG.MONTHS[m]}</span>)}</div>
                                </div>
                            )):zoom==='week'?headers.map((h,i)=>(
                                <div key={i} className={`flex-shrink-0 text-center text-xs font-medium border-l ${h.week===currentWeek?'bg-accent/10 text-accent':''}`} style={{width:colWidth,borderLeftWidth:h.monthStart?2:1,borderLeftColor:h.monthStart?'var(--border)':'var(--border)',padding:'4px 0'}}>
                                    <span>{h.label}</span>
                                </div>
                            )):zoom==='day'?headers.map((h,i)=>(
                                <div key={i} className={`flex-shrink-0 p-1 text-center text-xs font-medium border-l border-[var(--border)] ${h.month===currentMonth&&h.date===new Date().getDate()?'bg-accent/10 text-accent':''}`} style={{width:colWidth}}>{h.label}</div>
                            )):headers.map((h,i)=>(
                                <div key={i} className={`flex-shrink-0 p-2 text-center text-xs font-medium border-l border-[var(--border)] ${h.month===currentMonth?'bg-accent/10 text-accent':''}`} style={{width:colWidth}}>{h.label}</div>
                            ))}
                            {zoom==='week'&&monthBoundaryLines.map((b,idx)=>(
                                <div key={`mbh-${idx}`} className="absolute top-0 bottom-0 pointer-events-none" style={{left:250+b.weekIndex*colWidth+b.dayOffset*(colWidth/7),borderLeft:'1.5px dashed var(--text-muted)',opacity:0.35,zIndex:1}}/>
                            ))}
                        </div>
                        {groupedByCategory.map(({category,actions:catActions},groupIdx)=>{
                            const sourceBoardId=category._sourceBoardId;
                            const prevSourceBoardId=groupIdx>0?groupedByCategory[groupIdx-1].category._sourceBoardId:null;
                            const shouldShowBoardHeader=!!(boardGroups && boardGroups.length>0 && sourceBoardId && sourceBoardId!==prevSourceBoardId);
                            const boardGroup=shouldShowBoardHeader?boardGroups.find(g=>g.boardId===sourceBoardId):null;
                            return (
                            <div key={category.id}>
                                {boardGroup && (
                                    // Board name overflows the 250px sticky label into the months zone on
                                    // purpose: the next sibling (flex-1) shares the same background so the
                                    // label reads correctly as one continuous banner, and the name stays
                                    // fully visible — no ellipsis — regardless of length.
                                    <div className="timeline-board-group-row flex" style={{background:boardGroup.boardColor,color:'#fff',fontWeight:700,fontSize:13,letterSpacing:0.3,borderTop:'2px solid rgba(255,255,255,0.2)'}}>
                                        <div className="w-[250px] flex-shrink-0 sticky left-0 z-30 flex items-center" style={{background:boardGroup.boardColor,padding:'8px 12px',overflow:'visible'}}>
                                            <span title={boardGroup.boardName} style={{whiteSpace:'nowrap'}}>{boardGroup.boardName}</span>
                                        </div>
                                        <div className="flex-1" style={{background:boardGroup.boardColor}}/>
                                    </div>
                                )}
                                <div className="timeline-category-row flex" onDragOver={(e)=>{if(onUpdateAction){const types=Array.from(e.dataTransfer.types||[]).map(t=>t.toLowerCase());if(types.includes('actionid')){e.preventDefault();e.currentTarget.classList.add('drag-over');}}}} onDragLeave={(e)=>{e.currentTarget.classList.remove('drag-over');}} onDrop={(e)=>{const types=Array.from(e.dataTransfer.types||[]).map(t=>t.toLowerCase());if(types.includes('actionid')){e.preventDefault();e.currentTarget.classList.remove('drag-over');const actionId=e.dataTransfer.getData('actionId');if(actionId&&onUpdateAction){onUpdateAction(actionId,{categoryId:category.id});}}}}>
                                    <div className="w-[250px] flex-shrink-0 sticky left-0 z-30 flex items-center" style={{background:'var(--bg-secondary)'}}>
                                        <div style={{width:4,alignSelf:'stretch',background:category.color,flexShrink:0}}/>
                                        <div className="timeline-category-sidebar">
                                            <div className="timeline-category-name">{category.name}</div>
                                            <div className="timeline-category-count">{catActions.length} {isCardAsTask?'tasks':'actions'}</div>
                                        </div>
                                    </div>
                                    <div className="flex-1" style={{background:'var(--bg-secondary)'}}/>
                                </div>
                                {catActions.sort((a,b)=>(a.action.order||0)-(b.action.order||0)).map(({action,tasks:actionTasks})=>{
                                    const isDragOverAction=dragOverAction?.actionId===action.id;
                                    const dragOverActionClass=isDragOverAction?(dragOverAction.position==='before'?'drop-indicator-before':'drop-indicator-after'):'';
                                    const{swimLanes,maxLanes}=calcSwimLanes(actionTasks,resizing);
                                    const rowHeight=Math.max(48,maxLanes*34+16);
                                    return(
                                    <div key={action.id} onDragOver={(e)=>handleActionDragOver(e,action)} onDragLeave={handleActionDragLeave} onDrop={(e)=>handleActionDrop(e,action)} className={`flex group relative ${dragOverActionClass}`} style={{borderBottom:'1px solid var(--border-light)'}}>
                                        <div className="w-[250px] flex-shrink-0 relative sticky left-0 z-30 timeline-action-sidebar" style={{background:'var(--bg-primary)',borderRight:'1px solid var(--border)',cursor:onReorderAction?'grab':'pointer'}} draggable={!!onReorderAction} onDragStart={(e)=>{if(onReorderAction){e.stopPropagation();e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('actionId',action.id);e.dataTransfer.setData('text/plain','action:'+action.id);e.currentTarget.classList.add('dragging');}}} onDragEnd={(e)=>{e.currentTarget.classList.remove('dragging');setDragOverAction(null);}} onClick={(e)=>{if(!e.defaultPrevented&&onOpenAction){onOpenAction(action);}}}>
                                            <div className="timeline-action-name">{action.name}</div>
                                            <div className="timeline-action-count">{actionTasks.length} tasks</div>
                                            {onReorderAction&&<div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-50 transition-opacity text-xs" style={{color:'var(--text-muted)'}} title="Drag to reorder">⋮⋮</div>}
                                        </div>
                                        <div className={`flex-1 relative ${dragOverActionRow===action.id?'action-row-drag-over':''}`} style={{height:`${rowHeight}px`,zIndex:20,overflow:'hidden',transition:'height 0.15s ease-out'}} onMouseDown={(e)=>handleCreateTaskStart(e,action)} onDragOver={(e)=>{handleActionRowDragOver(e,action);}} onDragLeave={(e)=>handleActionRowDragLeave(e,action)} onDrop={(e)=>{const taskId=e.dataTransfer.getData('taskId');if(taskId){e.stopPropagation();handleActionRowDrop(e,action);}}}>
                                            <div className="absolute inset-0 flex pointer-events-none">
                                                {headers.map((_,i)=>(
                                                    <div key={i} className={`border-l border-[var(--border)]`} style={{width:colWidth}}/>
                                                ))}
                                            </div>
                                            {zoom==='week'&&monthBoundaryLines.map((b,idx)=>(
                                                <div key={`mb-${idx}`} className="absolute top-0 bottom-0 pointer-events-none" style={{left:b.weekIndex*colWidth+b.dayOffset*(colWidth/7),borderLeft:'1.5px dashed var(--text-muted)',opacity:0.35,zIndex:1}}/>
                                            ))}
                                            {dragPreview&&dragPreview.actionId===action.id&&(
                                                <div className="drag-preview-line" style={{left:dragPreview.left,width:dragPreview.width,top:dragPreview.top||8,background:dragPreview.color||'var(--accent)'}}/>
                                            )}
                                            {creatingTask&&creatingTask.actionId===action.id&&(()=>{
                                                const previewLeft=Math.min(creatingTask.startX,creatingTask.currentX);
                                                const previewWidth=Math.abs(creatingTask.currentX-creatingTask.startX)||colWidth;
                                                const previewRight=previewLeft+previewWidth;
                                                // Find first swim lane that doesn't overlap with existing tasks
                                                const occupiedLanes=new Set();
                                                actionTasks.forEach(t=>{
                                                    const p=getPos(t);
                                                    if(!p)return;
                                                    if(previewLeft<p.left+p.width&&previewRight>p.left){
                                                        occupiedLanes.add(swimLanes[t.id]||0);
                                                    }
                                                });
                                                let freeLane=0;
                                                while(occupiedLanes.has(freeLane))freeLane++;
                                                return(
                                                <div className="absolute rounded-lg border-2 border-dashed border-secondary bg-secondary/20 flex items-center justify-center text-secondary text-xs font-medium pointer-events-none" style={{left:previewLeft,width:previewWidth,top:8+freeLane*34,height:26}}>
                                                    <span>New task</span>
                                                </div>);
                                            })()}
                                            {(()=>{
                                                // Pre-compute the left edge of the next task in the same lane so
                                                // TimelineBar knows how much free space it has for its overflow
                                                // label (skip the spill when a neighbour is too close).
                                                const positioned=actionTasks.map(t=>({task:t,pos:getPos(t),lane:swimLanes[t.id]||0})).filter(e=>e.pos);
                                                const nextLeftById={};
                                                for(const e of positioned){
                                                    let nearest=Infinity;
                                                    for(const o of positioned){
                                                        if(o.task.id===e.task.id)continue;
                                                        if(o.lane!==e.lane)continue;
                                                        if(o.pos.left>e.pos.left+e.pos.width&&o.pos.left<nearest)nearest=o.pos.left;
                                                    }
                                                    nextLeftById[e.task.id]=nearest;
                                                }
                                                return actionTasks.sort((a,b)=>(a.order||0)-(b.order||0)).map(task=>{
                                                    const pos=getPos(task);
                                                    if(!pos)return null;
                                                    const neighborLeftEdge=nextLeftById[task.id];
                                                    return(
                                                        <TimelineBar key={task.id} task={task} pos={pos} action={action} zoom={zoom}
                                                            swimLane={swimLanes[task.id]||0} isReadOnly={isReadOnly}
                                                            neighborLeftEdge={Number.isFinite(neighborLeftEdge)?neighborLeftEdge:undefined}
                                                            isResizing={resizing?.taskId===task.id} justResized={justResized}
                                                            isDragOver={dragOverTask?.taskId===task.id} dragOverPosition={dragOverTask?.taskId===task.id?dragOverTask.position:null}
                                                            onOpenTask={onOpenTask} onDragStart={handleTaskDragStart} onDragEnd={handleTaskDragEnd}
                                                            onDragOver={handleTaskDragOver} onDragLeave={handleTaskDragLeave} onDrop={handleTaskDrop}
                                                            onStartResize={startResize}
                                                            onResetLane={(id)=>onUpdateTask(id,{swimLane:undefined})}/>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default memo(TimelineView);
