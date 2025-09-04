import { CreateBookingData, Booking as BookingInterface } from './leedz_db';
export declare class Booking {
    id: string;
    clientId: string;
    title: string;
    description: string | null;
    address: string | null;
    startDate: Date | null;
    endDate: Date | null;
    startTime: string | null;
    endTime: string | null;
    duration: number | null;
    hourlyRate: number | null;
    flatRate: number | null;
    totalAmount: number | null;
    status: string | null;
    sourceEmail: string | null;
    extractedData: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    constructor(data: CreateBookingData | BookingInterface);
    static validate(data: CreateBookingData): {
        isValid: boolean;
        errors: string[];
    };
    calculateTotalAmount(): number;
    getDuration(): number;
    isCompleted(): boolean;
    isPending(): boolean;
    isCancelled(): boolean;
    hasLocation(): boolean;
    getDisplayTitle(): string;
    toCreateData(): CreateBookingData;
    toInterface(): BookingInterface;
    update(data: Partial<CreateBookingData>): void;
}
//# sourceMappingURL=Booking.d.ts.map