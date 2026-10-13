import { describe, expect, it } from 'vitest';
import { eventListRequest, isEventListRequest } from './event-list-request';

describe('isEventListRequest', () => {
  it('recognizes the state the shell links send', () => {
    expect(isEventListRequest(eventListRequest)).toBe(true);
  });

  it('ignores any other history state', () => {
    expect(isEventListRequest(null)).toBe(false);
    expect(isEventListRequest(undefined)).toBe(false);
    expect(isEventListRequest({ eventList: 'yes' })).toBe(false);
    expect(isEventListRequest({ notice: 'archived' })).toBe(false);
  });
});
