/**
 * lib/orchestrator/graph.ts
 * ---------------------------------------------------------------------------
 * Orkestrasi alur kerja dengan **LangGraph** (StateGraph).
 *
 * Graph ini menggantikan loop `for` manual di ChatDevEngine:
 *
 *        START
 *          |
 *    [ requirement ] ─┐
 *          |          │
 *    [   design   ]   │  tiap node = satu fase,
 *          |          │  di dalamnya task-task fase tersebut
 *    [   coding   ]   │  dieksekusi PARALEL sesuai peran
 *          |          │
 *    [  testing   ]   │
 *          |          │
 *    [documenting ] ──┘
 *          |
 *         END
 *
 * Human-in-the-Loop modelled sebagai interrupt di node yang sedang berjalan;
 * setelah user menjawab, graph dilanjutkan (resume) ke node berikutnya.
 * ---------------------------------------------------------------------------
 */
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import type { Artifact, Message, WorkflowPhase } from '@/types/agent'
import { PHASE_ORDER } from './taskRegistry'

/**
 * State bersama antar node. Reducer wajib untuk list karena beberapa task
 * dalam satu fase berjalan paralel dan sama-sama menambahkan ke list yang sama.
 */
export const OfficeState = Annotation.Root({
  /** Brief proyek dari pengguna. */
  task: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),

  /** Fase yang sedang diproses oleh node ini. */
  phase: Annotation<WorkflowPhase>({
    reducer: (_prev, next) => next,
    default: () => 'requirement',
  }),

  /** Index fase berikutnya di PHASE_ORDER. */
  step: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),

  /** Transkrip percakapan (dikumpulkan paralel, jadi reducer concat). */
  messages: Annotation<Message[]>({
    reducer: (_prev, next) => [...(_prev ?? []), ...(next ?? [])],
    default: () => [],
  }),

  /** Hasil kerja (deliverable) — inilah isi tab Workspace. */
  artifacts: Annotation<Artifact[]>({
    reducer: (_prev, next) => [...(_prev ?? []), ...(next ?? [])],
    default: () => [],
  }),

  /** Flag berhenti (user menekan Interupsi / menjawab batal). */
  halted: Annotation<boolean>({
    reducer: (_prev, next) => next ?? false,
    default: () => false,
  }),
})

export type OfficeStateType = typeof OfficeState.State

/** Phase node factory — dipanggil sekali per fase. */
export type PhaseRunner = (state: OfficeStateType) => Promise<Partial<OfficeStateType>>

/**
 * Bangun graph dari daftar runner fase.
 *
 * @param hitl Jika true, setiap node berhenti sejenak meminta persetujuan
 *              manusia sebelum lanjut ke fase berikutnya.
 */
export function buildGraph(runPhase: PhaseRunner, hitl: () => boolean) {
  const graph = new StateGraph(OfficeState)

  // Satu node per fase. (Type di-cast karena LangGraph mengetik node dari
  // daftar edge, sedangkan nama node kita berasal dari WorkflowPhase.)
  PHASE_ORDER.forEach((phase, index) => {
    graph.addNode(phase, async (state: OfficeStateType) => {
      if (state.halted) return { halted: true }

      const result = await runPhase({ ...state, phase, step: index })
      return { ...result, phase, step: index + 1 }
    })
  })

  // Rantai antar fase: START → requirement → design → … → END.
  const chain = [START, ...PHASE_ORDER, END] as unknown as string[]
  for (let i = 0; i < chain.length - 1; i++) {
    graph.addEdge(chain[i] as never, chain[i + 1] as never)
  }

  return graph.compile()
}

export type CompiledOfficeGraph = ReturnType<typeof buildGraph>