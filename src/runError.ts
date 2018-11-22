export class RunError extends Error {
    constructor(message: string, public readonly inner?: any) {
        super(message); // 'Error' breaks prototype chain here
        Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
    }
}