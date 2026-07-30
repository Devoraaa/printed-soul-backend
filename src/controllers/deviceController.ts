import { Request, Response, NextFunction } from "express"
import { DeviceModel } from "../models/DeviceModel"
import { ApiError } from "../api/ApiError"
import { ApiResponse } from "../api/ApiResponse"
import { asyncHandler } from "../api/asyncHandler"

const slugify = (brand: string, name: string) =>
  `${brand}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

export const getDeviceModels = asyncHandler(async (req: Request, res: Response) => {
  const filter: any = { isActive: true }
  if (req.query.brand) filter.brand = req.query.brand
  const devices = await DeviceModel.find(filter).populate("brand", "name slug").sort("displayName")
  res.json(ApiResponse.success(devices, "Device models retrieved"))
})

export const getDevicesByBrand = asyncHandler(async (req: Request, res: Response) => {
  const { Brand } = await import("../models/Brand")
  const brand = await Brand.findOne({ slug: req.params.brandSlug })
  if (!brand) return res.json(ApiResponse.success([], "Brand not found"))

  const devices = await DeviceModel.find({ brand: brand._id, isActive: true }).sort("displayName")
  res.json(ApiResponse.success(devices, `Devices for ${brand.name}`))
})

export const createDeviceModel = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const { brand, name, displayName, releaseYear } = req.body
  const { Brand } = await import("../models/Brand")
  const brandDoc = await Brand.findById(brand)
  if (!brandDoc) return next(new ApiError(404, "Brand not found"))

  const slug = slugify(brandDoc.slug, name)
  const device = await DeviceModel.create({ brand, name, slug, displayName, releaseYear })
  res.status(201).json(ApiResponse.success(device, "Device model created"))
})

export const updateDeviceModel = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const device = await DeviceModel.findById(req.params.id)
  if (!device) return next(new ApiError(404, "Device model not found"))

  const fields = ["name", "displayName", "isActive", "releaseYear", "basePrice", "comparePrice", "templates"]
  fields.forEach((f) => { if (req.body[f] !== undefined) (device as any)[f] = req.body[f] })
  await device.save()
  res.json(ApiResponse.success(device, "Device model updated"))
})

export const deleteDeviceModel = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const device = await DeviceModel.findById(req.params.id)
  if (!device) return next(new ApiError(404, "Device model not found"))
  await (device as any).softDelete()
  res.json(ApiResponse.success({}, "Device model deleted"))
})
