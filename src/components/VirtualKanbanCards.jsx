import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

const ESTIMATE_SIZE = 90;
const OVERSCAN = 8;
const GAP = 8;

const VirtualKanbanCards = ({ items, renderItem }) => {
    const scrollRef = useRef(null);
    const virtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => ESTIMATE_SIZE,
        overscan: OVERSCAN,
        gap: GAP,
        getItemKey: (index) => items[index]?.id || index,
    });

    return (
        <div ref={scrollRef} style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
                {virtualizer.getVirtualItems().map(virtualRow => (
                    <div
                        key={items[virtualRow.index]?.id || virtualRow.index}
                        data-index={virtualRow.index}
                        ref={virtualizer.measureElement}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start}px)`,
                        }}
                    >
                        {renderItem(items[virtualRow.index])}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default VirtualKanbanCards;
