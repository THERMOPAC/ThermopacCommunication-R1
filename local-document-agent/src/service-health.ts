export type AgentState =
  | 'STARTING'
  | 'CONNECTING'
  | 'IDLE'
  | 'PROCESSING'
  | 'RETRY_WAIT'
  | 'OFFLINE'
  | 'ERROR'
  | 'STOPPING';

export class ServiceHealth {
  private _state: AgentState = 'STARTING';
  private _lastError: string | null = null;
  private _processedJobs = 0;
  private _failedJobs = 0;

  get state(): AgentState    { return this._state; }
  get lastError(): string | null { return this._lastError; }
  get processedJobs(): number { return this._processedJobs; }
  get failedJobs(): number   { return this._failedJobs; }

  transition(newState: AgentState, error?: string): void {
    this._state = newState;
    if (error) this._lastError = error;
    else if (newState === 'IDLE') this._lastError = null;
  }

  recordSuccess(): void { this._processedJobs++; }
  recordFailure(reason: string): void {
    this._failedJobs++;
    this._lastError = reason;
  }

  summary() {
    return {
      state:         this._state,
      lastError:     this._lastError,
      processedJobs: this._processedJobs,
      failedJobs:    this._failedJobs,
    };
  }
}
