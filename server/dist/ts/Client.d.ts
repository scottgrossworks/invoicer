import { CreateClientData, Client as ClientInterface } from './leedz_db';
export declare class Client {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    constructor(data: CreateClientData | ClientInterface);
    static validate(data: CreateClientData): {
        isValid: boolean;
        errors: string[];
    };
    private static isValidEmail;
    private static isValidPhone;
    getDisplayName(): string;
    hasContactInfo(): boolean;
    isComplete(): boolean;
    toCreateData(): CreateClientData;
    toInterface(): ClientInterface;
    update(data: Partial<CreateClientData>): void;
}
//# sourceMappingURL=Client.d.ts.map