import { describe, expect, it } from 'vitest';
import { clozeFor, findCloze, inflections } from '@/lib/cloze';

describe('findCloze', () => {
  it('finds the exact term case-insensitively', () => {
    const m = findCloze('apple', 'An Apple a day keeps the doctor away.');
    expect(m?.answer).toBe('Apple');
    expect(m?.before).toBe('An ');
    expect(m?.after).toBe(' a day keeps the doctor away.');
  });

  it('matches simple inflections', () => {
    expect(findCloze('walk', 'She walks to work.')?.answer).toBe('walks');
    expect(findCloze('watch', 'He watches TV.')?.answer).toBe('watches');
    expect(findCloze('play', 'They played well.')?.answer).toBe('played');
    expect(findCloze('read', 'I am reading.')?.answer).toBe('reading');
    expect(findCloze('make', 'We are making progress.')?.answer).toBe('making');
    expect(findCloze('study', 'She studies hard.')?.answer).toBe('studies');
    expect(findCloze('stop', 'The bus stopped.')?.answer).toBe('stopped');
    expect(findCloze('like', 'I liked it.')?.answer).toBe('liked');
  });

  it('does not match inside other words', () => {
    expect(findCloze('cat', 'The category is wrong.')).toBeNull();
    expect(findCloze('run', 'It was a rerun.')).toBeNull();
    expect(findCloze('don', "Don't worry.")).toBeNull();
  });

  it('handles phrases, apostrophes and hyphens', () => {
    expect(findCloze('give up', 'Never give  up on your dreams.')?.answer).toBe('give  up');
    expect(findCloze('give up', 'He gives up too easily.')?.answer).toBe('gives up');
    expect(findCloze("don't", 'I don’t know.')?.answer).toBe("don't");
    expect(findCloze('well-known', 'A well-known fact.')?.answer).toBe('well-known');
  });

  it('prefers the longest form', () => {
    expect(findCloze('run', 'She is running.')?.answer).toBe('running');
  });

  it('escapes regex characters', () => {
    expect(findCloze('c++', 'I write c++ code.')?.answer).toBe('c++');
    expect(findCloze('a.b', 'axb is not it.')).toBeNull();
  });

  it('clozeFor picks the first matching example', () => {
    expect(clozeFor({ term: 'cat', examples: ['No match here.', 'My cat sleeps.'] })?.answer).toBe('cat');
    expect(clozeFor({ term: 'cat', examples: [] })).toBeNull();
  });
});

describe('inflections', () => {
  it('lists forms', () => {
    expect(inflections('study')).toEqual(expect.arrayContaining(['studies', 'studied', 'studying']));
    expect(inflections('make')).toContain('making');
  });
});
