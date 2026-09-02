/** Enable only after the v1 migration has been installed and verified. */
export const atomicPlannerWorkflowsEnabled = process.env.NEXT_PUBLIC_ATOMIC_PLANNER_WORKFLOWS === 'true'

export function atomicWorkflowError(error: { code?: string; message?: string }): string {
  if (error.code === 'PGRST202' || error.code === '42883') {
    return 'This update requires the planner database migration. Nothing was changed. Please contact support.'
  }
  return error.message || 'The operation could not be completed. Your inputs have been kept.'
}
