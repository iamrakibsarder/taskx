import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CollectionKey, DataState, EntityOf, ID, Workspace } from '@/types/domain';
import { defaultWorkspace } from '@/data/sample';

export interface DataSliceState extends DataState {
  status: 'loading' | 'ready' | 'error';
  error?: string;
}

const initialState: DataSliceState = {
  status: 'loading',
  workspace: defaultWorkspace(),
  clients: [],
  projects: [],
  tasks: [],
  invoices: [],
  expenses: [],
};

type AnyEntity = EntityOf<CollectionKey>;

const dataSlice = createSlice({
  name: 'data',
  initialState,
  reducers: {
    loaded(state, a: PayloadAction<DataState>) {
      Object.assign(state, a.payload, { status: 'ready', error: undefined });
    },
    loadFailed(state, a: PayloadAction<string>) {
      state.status = 'error';
      state.error = a.payload;
    },
    upsert(state, a: PayloadAction<{ col: CollectionKey; item: AnyEntity }>) {
      const list = state[a.payload.col] as AnyEntity[];
      const i = list.findIndex((x) => x.id === a.payload.item.id);
      if (i >= 0) list[i] = a.payload.item;
      else list.push(a.payload.item);
    },
    patch(state, a: PayloadAction<{ col: CollectionKey; id: ID; fields: Partial<AnyEntity> }>) {
      const list = state[a.payload.col] as AnyEntity[];
      const i = list.findIndex((x) => x.id === a.payload.id);
      if (i >= 0) list[i] = { ...list[i]!, ...a.payload.fields } as AnyEntity;
    },
    remove(state, a: PayloadAction<{ col: CollectionKey; id: ID }>) {
      const col = a.payload.col;
      (state as unknown as Record<CollectionKey, AnyEntity[]>)[col] = (state[col] as AnyEntity[]).filter(
        (x) => x.id !== a.payload.id,
      );
    },
    setWorkspace(state, a: PayloadAction<Partial<Workspace>>) {
      state.workspace = { ...state.workspace, ...a.payload };
    },
  },
});

export const dataActions = dataSlice.actions;
export default dataSlice.reducer;

/* Typed helpers so call sites keep entity types. */
export const upsert = <K extends CollectionKey>(col: K, item: EntityOf<K>) => dataActions.upsert({ col, item });
export const patch = <K extends CollectionKey>(col: K, id: ID, fields: Partial<EntityOf<K>>) =>
  dataActions.patch({ col, id, fields: fields as Partial<AnyEntity> });
export const remove = (col: CollectionKey, id: ID) => dataActions.remove({ col, id });
