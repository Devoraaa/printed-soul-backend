import { Query } from "mongoose"

export class QueryFeatures<T> {
  public query: Query<T[], T>
  public queryString: any

  constructor(query: Query<T[], T>, queryString: any) {
    this.query = query
    this.queryString = queryString
  }

  filter() {
    const queryObj = { ...this.queryString }
    const excludedFields = ["page", "sort", "limit", "fields", "cursor", "search"]
    excludedFields.forEach((el) => delete queryObj[el])

    let queryStr = JSON.stringify(queryObj)
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt|in)\b/g, (match) => `$${match}`)

    this.query = this.query.find(JSON.parse(queryStr))
    return this
  }

  search(searchFields: string[]) {
    if (this.queryString.search && searchFields.length > 0) {
      const searchRegex = new RegExp(this.queryString.search, "i")
      const searchConditions = searchFields.map((field) => ({
        [field]: searchRegex,
      }))
      this.query = this.query.find({ $or: searchConditions } as any)
    }
    return this
  }

  sort() {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(",").join(" ")
      this.query = this.query.sort(sortBy)
    } else {
      this.query = this.query.sort("-createdAt")
    }
    return this
  }

  limitFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(",").join(" ")
      this.query = this.query.select(fields)
    } else {
      this.query = this.query.select("-__v")
    }
    return this
  }

  paginate() {
    if (this.queryString.cursor) {
      this.query = this.query.find({ _id: { $lt: this.queryString.cursor } } as any)
      const limit = parseInt(this.queryString.limit as string, 10) || 10
      this.query = this.query.limit(limit)
      return this
    }

    const page = parseInt(this.queryString.page as string, 10) || 1
    const limit = parseInt(this.queryString.limit as string, 10) || 10
    const skip = (page - 1) * limit

    this.query = this.query.skip(skip).limit(limit)
    return this
  }
}
