// A failed login is recorded under either name (see AuthEvent['event_type'] and the knex auth seed).
// Every count of failed logins must use this list, or the alias rows silently drop out (#6).
export const LOGIN_FAILURE_EVENT_TYPES = ['login_failure', 'failed_login'] as const;
