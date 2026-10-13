// Finding `type` values the platform emits for repository-based scanning
// (libcovulor/domain/constants.py FINDING_TYPES). Legacy "DAST" and the "Pentest" kind are
// intentionally absent: DAST/Strix is discontinued and pentest findings use finding_type=pentest.
export const FINDING_TYPES = [
  'SAST', 'SCA', 'Secrets', 'PII', 'Access Control', 'License', 'Configuration',
  'IaC', 'API', 'Cryptography', 'Malicious Artifact',
] as const
