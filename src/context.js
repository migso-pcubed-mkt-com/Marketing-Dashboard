import { createContext, useContext } from 'react';

// Board data context: boards, entities, Trello sync, board CRUD handlers
export const BoardContext = createContext();
export const useBoard = () => useContext(BoardContext);

// Filter context: filters state and setter
export const FilterContext = createContext();
export const useFilter = () => useContext(FilterContext);

// Legacy unified context (backward compat during migration)
export const AppContext = createContext();
export const useApp = () => useContext(AppContext);
