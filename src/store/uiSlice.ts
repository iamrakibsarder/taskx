import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ID, ISODate, Timer } from '@/types/domain';
import { storage } from '@/lib/utils';
import { todayISO } from '@/lib/format';

const TIMER_KEY = 'taskx.timer';

export interface Draft {
  date: ISODate;
  projectId: ID | '';
  memo: string;
  link: string;
  by: string;
  minutes: number;
}

export interface UiState {
  timer: Timer | null;
  draft: Draft;
}

const initialState: UiState = {
  timer: storage.get<Timer>(TIMER_KEY),
  draft: { date: todayISO(), projectId: '', memo: '', link: '', by: '', minutes: 60 },
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    startTimer(state, a: PayloadAction<Omit<Timer, 'start'>>) {
      state.timer = { ...a.payload, start: Date.now() };
      storage.set(TIMER_KEY, state.timer);
    },
    clearTimer(state) {
      state.timer = null;
      storage.set(TIMER_KEY, null);
    },
    setDraft(state, a: PayloadAction<Partial<Draft>>) {
      state.draft = { ...state.draft, ...a.payload };
    },
  },
});

export const { startTimer, clearTimer, setDraft } = uiSlice.actions;
export default uiSlice.reducer;
