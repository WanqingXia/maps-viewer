import { describe, it, expect } from 'vitest';
import { MapsViewerError, TokenMissingError } from '@maps-viewer/shared';

describe('MapsViewerError', () => {
  it('captures message and code', () => {
    const err = new MapsViewerError('something broke', 'SMOKE_FAIL');
    expect(err.message).toBe('something broke');
    expect(err.code).toBe('SMOKE_FAIL');
    expect(err.name).toBe('MapsViewerError');
    expect(err instanceof Error).toBe(true);
  });

  it('preserves cause when wrapping a foreign error', () => {
    const inner = new Error('underlying');
    const err = new MapsViewerError('wrapped', 'WRAP_FAIL', inner);
    expect(err.cause).toBe(inner);
  });
});

describe('TokenMissingError', () => {
  it('sets code to TOKEN_MISSING', () => {
    const err = new TokenMissingError();
    expect(err.code).toBe('TOKEN_MISSING');
    expect(err.name).toBe('TokenMissingError');
    expect(err instanceof MapsViewerError).toBe(true);
  });
});
