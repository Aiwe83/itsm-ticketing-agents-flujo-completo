import { Mapping, type IMapping } from '../models/Mapping.model'

export class MappingRepository {
  async findByContext(meshId: string): Promise<IMapping[]> {
    return await Mapping.find({ meshId }).sort({ createdAt: 1 }).exec()
  }
}

export const mappingRepository = new MappingRepository()
