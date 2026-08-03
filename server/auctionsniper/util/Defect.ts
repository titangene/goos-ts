export class Defect extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'Defect';
  }
}
