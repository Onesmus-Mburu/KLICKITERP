/**
 * Shape of every API error response (FR-API-005.1).
 * `request_id` correlates with Nginx/API logs end-to-end (NFR-MNT-005).
 */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  request_id: string;
}
