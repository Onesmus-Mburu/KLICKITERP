import { Injectable } from "@nestjs/common";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { BillSponsorEntity } from "../domain/bill-sponsor.entity";
import { BillSponsorRepository } from "../infrastructure/bill-sponsor.repository";

export interface CreateSponsorInput {
  name: string;
  contacts?: Record<string, unknown>;
  agreementFileId?: string | null;
  allowsCashConversion?: boolean;
}

export interface UpdateSponsorInput {
  name?: string;
  contacts?: Record<string, unknown>;
  agreementFileId?: string | null;
  allowsCashConversion?: boolean;
}

/** CRUD for `bill_sponsor` — straightforward per the task brief. */
@Injectable()
export class SponsorsService {
  constructor(private readonly sponsorRepository: BillSponsorRepository) {}

  async create(input: CreateSponsorInput, actorId: string | null): Promise<BillSponsorEntity> {
    if (await this.sponsorRepository.findByName(input.name)) {
      throw new ConflictException(`bill_sponsor name already in use: ${input.name}`);
    }
    return this.sponsorRepository.create({
      name: input.name,
      contacts: input.contacts ?? {},
      agreementFileId: input.agreementFileId ?? null,
      allowsCashConversion: input.allowsCashConversion ?? false,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }

  async findByIdOrFail(id: string): Promise<BillSponsorEntity> {
    return this.sponsorRepository.findByIdOrFail(id);
  }

  async list(): Promise<BillSponsorEntity[]> {
    return this.sponsorRepository.list();
  }

  async update(id: string, changes: UpdateSponsorInput, actorId: string | null): Promise<BillSponsorEntity> {
    const sponsor = await this.sponsorRepository.findByIdOrFail(id);
    if (changes.name !== undefined) sponsor.name = changes.name;
    if (changes.contacts !== undefined) sponsor.contacts = changes.contacts;
    if (changes.agreementFileId !== undefined) sponsor.agreementFileId = changes.agreementFileId;
    if (changes.allowsCashConversion !== undefined) sponsor.allowsCashConversion = changes.allowsCashConversion;
    sponsor.updatedBy = actorId;
    return this.sponsorRepository.save(sponsor);
  }
}
