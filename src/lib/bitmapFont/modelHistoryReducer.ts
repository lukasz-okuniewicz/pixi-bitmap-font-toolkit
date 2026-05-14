import type { BitmapFontModel } from './types'
import { defaultBitmapFontModel } from './types'

export type ModelHistoryState = {
  model: BitmapFontModel
  past: BitmapFontModel[]
  future: BitmapFontModel[]
}

export const initialModelHistoryState = (): ModelHistoryState => ({
  model: defaultBitmapFontModel(),
  past: [],
  future: [],
})

function cloneModel(m: BitmapFontModel): BitmapFontModel {
  return structuredClone(m)
}

export type ModelHistoryAction =
  | { type: 'set'; update: BitmapFontModel | ((prev: BitmapFontModel) => BitmapFontModel); recordHistory: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  /** Replace entire history stack (e.g. switching workspace slot). */
  | { type: 'hydrate'; state: ModelHistoryState }

const MAX_PAST = 50

export function modelHistoryReducer(state: ModelHistoryState, action: ModelHistoryAction): ModelHistoryState {
  switch (action.type) {
    case 'hydrate': {
      return {
        model: cloneModel(action.state.model),
        past: action.state.past.map(cloneModel),
        future: action.state.future.map(cloneModel),
      }
    }
    case 'set': {
      const prev = state.model
      const next =
        typeof action.update === 'function' ? (action.update as (p: BitmapFontModel) => BitmapFontModel)(prev) : action.update
      if (next === prev) return state
      if (!action.recordHistory) {
        return { ...state, model: next, past: [], future: [] }
      }
      return {
        model: next,
        past: [...state.past, cloneModel(prev)].slice(-MAX_PAST),
        future: [],
      }
    }
    case 'undo': {
      if (state.past.length === 0) return state
      const snapshot = state.past[state.past.length - 1]!
      const newPast = state.past.slice(0, -1)
      return {
        model: cloneModel(snapshot),
        past: newPast,
        future: [cloneModel(state.model), ...state.future].slice(0, MAX_PAST),
      }
    }
    case 'redo': {
      if (state.future.length === 0) return state
      const snapshot = state.future[0]!
      const newFuture = state.future.slice(1)
      return {
        model: cloneModel(snapshot),
        past: [...state.past, cloneModel(state.model)].slice(-MAX_PAST),
        future: newFuture,
      }
    }
    default:
      return state
  }
}
