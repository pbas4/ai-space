export interface Validator {
  validate(): boolean;
}

export class BaseService {
  validate(): boolean {
    return true;
  }
}

export function makeBase(): BaseService {
  return new BaseService();
}
