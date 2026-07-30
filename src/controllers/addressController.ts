import { Request, Response, NextFunction } from "express"
import { Address } from "../models/Address"
import { ApiError } from "../api/ApiError"
import { ApiResponse } from "../api/ApiResponse"
import { asyncHandler } from "../api/asyncHandler"

export const getMyAddresses = asyncHandler(async (req: any, res: Response) => {
  const addresses = await Address.find({ user: req.user.id }).sort("-isDefault createdAt")
  res.json(ApiResponse.success(addresses, "Addresses retrieved"))
})

export const createAddress = asyncHandler(async (req: any, res: Response) => {
  const { label, fullName, phone, street, city, state, pincode, country, isDefault } = req.body

  // If new address is default, unset all others
  if (isDefault) await Address.updateMany({ user: req.user.id }, { isDefault: false })

  const address = await Address.create({ user: req.user.id, label, fullName, phone, street, city, state, pincode, country, isDefault })
  res.status(201).json(ApiResponse.success(address, "Address added"))
})

export const updateAddress = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const address = await Address.findOne({ _id: req.params.id, user: req.user.id })
  if (!address) return next(new ApiError(404, "Address not found"))

  const fields = ["label", "fullName", "phone", "street", "city", "state", "pincode", "country", "isDefault"]
  fields.forEach((f) => { if (req.body[f] !== undefined) (address as any)[f] = req.body[f] })

  if (req.body.isDefault) await Address.updateMany({ user: req.user.id, _id: { $ne: address._id } }, { isDefault: false })

  await address.save()
  res.json(ApiResponse.success(address, "Address updated"))
})

export const deleteAddress = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const address = await Address.findOneAndDelete({ _id: req.params.id, user: req.user.id })
  if (!address) return next(new ApiError(404, "Address not found"))
  res.json(ApiResponse.success({}, "Address deleted"))
})
