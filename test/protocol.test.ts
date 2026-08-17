import assert from 'node:assert/strict'
import test from 'node:test'

import {
  HANDOFF_STATES,
  WORKFLOW_STATES,
  isHandoffState,
  isValidMetadata,
  isWorkflowState,
} from '../src/protocol.ts'

test('separates packet states from the broader workflow states', () => {
  assert.deepEqual(HANDOFF_STATES, [
    'ready_to_implement',
    'ready_to_review',
    'changes_requested',
    'approved',
  ])
  assert.deepEqual(WORKFLOW_STATES, [
    'ready_to_implement',
    'implementing',
    'ready_to_review',
    'changes_requested',
    'approved',
  ])
  assert.equal(isHandoffState('implementing'), false)
  assert.equal(isWorkflowState('implementing'), true)
})

test('rejects local-only implementing as v1 handoff metadata', () => {
  assert.equal(isValidMetadata({
    schema: 'opencode-review-bridge/v1',
    kind: 'plan',
    state: 'implementing',
    head: null,
  }), false)
})
