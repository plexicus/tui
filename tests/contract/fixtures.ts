// Dummy values copied from docs/CLIENT-API-CONTRACT.md, PLUS keys the contract forbids, to prove
// that nothing outside the allowlist can reach the UI even if a server starts returning it.
export const FORBIDDEN_KEYS = [
  'model', 'provider', 'cost', 'usd', 'llm', 'prompt', 'api_key', 'secret', 'password', 'credential',
  'tokens_in', 'access_token', 'minio', 'pod', 'namespace', 'engine', 'workflow', 'webhook', 'logs',
]
export const LEAK_MARKERS = ['LEAK-model-gpt', 'LEAK-provider-openai', 'LEAK-cost-1.23', 'LEAK-token-abc', 'LEAK-pod-xyz', 'LEAK-minio-key', 'LEAK-pass']

export const creditsFixture = {
  active: true,
  enforced: false,
  plan: 'scale',
  period: '2026-10',
  cycle_start: '2026-10-01T00:00:00Z',
  resets_at: '2026-11-01T00:00:00Z',
  credits: {
    used: 300, remaining: 25190, limit: 25500, unlimited: false,
    plan_grant: 25000, granted: 25500, consumed: 300, reserved: 10, available: 25190, total: 25500, hard_stop: true,
    model: 'LEAK-model-gpt', provider: 'LEAK-provider-openai', cost_usd: 'LEAK-cost-1.23', tokens_in: 'LEAK-token-abc',
  },
  pentest_units: { used: 0, remaining: 4, limit: 4, unlimited: false, plan_grant: 4 },
  by_action: [{ action: 'deep_code_analysis', unit: 'credits', count: 1, credits: 300, model: 'LEAK-model-gpt' }],
  credits_notice: ['LEAK-provider-openai'],
  model: 'LEAK-model-gpt',
  provider: 'LEAK-provider-openai',
  cost: 'LEAK-cost-1.23',
  api_key: 'LEAK-token-abc',
}

export const pentestsFixture = {
  items: [
    {
      id: '3f0c2a9e-0000-4000-8000-000000000001',
      name: 'Juice Shop',
      target_url: 'https://admin:LEAK-pass@shop.example.test/app',
      scan_mode: 'standard',
      status: 'completed',
      created_at: '2026-10-13T08:00:00+00:00',
      started_at: '2026-10-13T08:01:00+00:00',
      launched_at: '2026-10-13T08:02:00+00:00',
      completed_at: '2026-10-13T08:40:00+00:00',
      severity_counts: { critical: 0, high: 2, medium: 0, low: 0, informational: 1 },
      findings_total: 3,
      report_available: true,
      nexus_pod_name: 'LEAK-pod-xyz',
      report_minio_key: 'LEAK-minio-key',
      engine: 'LEAK-provider-openai',
      model: 'LEAK-model-gpt',
      workflow_id: 'LEAK-token-abc',
      authentication: { username: 'u', password: 'LEAK-pass' },
      strix_logs: ['LEAK-pod-xyz'],
      llm_cost: 'LEAK-cost-1.23',
    },
    { id: 'p2', name: 'Second', target_url: 'https://two.example.test', status: 'running', severity_counts: {}, findings_total: 0, report_available: false },
    { name: 'no id is dropped' },
  ],
  total: 2,
  page: 1,
  page_size: 10,
}
