/** Shared by the request form in the browser and the server's checks. */
export const MAX_PURPOSE_LENGTH = 200
/** The requester's name or organisation, as they declare it. */
export const MAX_REQUESTER_NAME_LENGTH = 80
/** At most this many pieces of information in one request. */
export const MAX_ATTRIBUTES_PER_REQUEST = 8
/** The lifetimes the requester picks from; a request stays answerable for a week at most. */
export const REQUEST_LIFETIMES_HOURS = [1, 24, 168] as const
export const MAX_REQUEST_LIFETIME_MS = 168 * 60 * 60 * 1000
/** Requests kept in memory at once, so anonymous creation cannot exhaust the server. */
export const MAX_OPEN_REQUESTS = 2000
