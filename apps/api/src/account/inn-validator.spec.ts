import { isValidInn } from './inn-validator';

describe('isValidInn', () => {
  it.each(['7707083893', '500100732259'])('accepts a valid Russian INN: %s', (inn) => {
    expect(isValidInn(inn)).toBe(true);
  });

  it.each(['7707083894', '500100732258', '123', 'abcdefghij'])(
    'rejects an invalid INN: %s',
    (inn) => {
      expect(isValidInn(inn)).toBe(false);
    },
  );
});
