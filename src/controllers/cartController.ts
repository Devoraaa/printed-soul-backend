import { Request, Response, NextFunction } from "express"
import { Cart } from "../models/Cart"
import { Product } from "../models/Product"
import { ApiError } from "../api/ApiError"
import { ApiResponse } from "../api/ApiResponse"
import { asyncHandler } from "../api/asyncHandler"

export const getCart = asyncHandler(async (req: any, res: Response) => {
  const cart = await Cart.findOne({ user: req.user.id })
    .populate({ path: "items.product", select: "name price stock images isActive slug" })

  if (!cart) return res.json(ApiResponse.success({ items: [], totalAmount: 0 }, "Cart is empty"))
  res.json(ApiResponse.success(cart, "Cart retrieved"))
})

export const addToCart = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const { productId, quantity = 1 } = req.body

  const product = await Product.findById(productId)
  if (!product || !product.isActive) return next(new ApiError(404, "Product not found"))
  if (product.stock < quantity) return next(new ApiError(400, `Only ${product.stock} in stock`))

  let cart = await Cart.findOne({ user: req.user.id })
  if (!cart) cart = new Cart({ user: req.user.id, items: [] })

  const existingIndex = cart.items.findIndex((i) => i.product.toString() === productId)

  if (existingIndex > -1) {
    const newQty = cart.items[existingIndex].quantity + parseInt(quantity)
    if (newQty > product.stock) return next(new ApiError(400, `Only ${product.stock} in stock`))
    cart.items[existingIndex].quantity = newQty
  } else {
    cart.items.push({ product: productId, quantity: parseInt(quantity), price: product.price })
  }

  await cart.save()
  res.json(ApiResponse.success(cart, "Item added to cart"))
})

export const updateCartItem = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const { productId, quantity } = req.body
  const cart = await Cart.findOne({ user: req.user.id })
  if (!cart) return next(new ApiError(404, "Cart not found"))

  const idx = cart.items.findIndex((i) => i.product.toString() === productId)
  if (idx === -1) return next(new ApiError(404, "Item not in cart"))

  if (quantity <= 0) {
    cart.items.splice(idx, 1)
  } else {
    const product = await Product.findById(productId)
    if (product && quantity > product.stock) return next(new ApiError(400, `Only ${product.stock} in stock`))
    cart.items[idx].quantity = quantity
  }

  await cart.save()
  res.json(ApiResponse.success(cart, "Cart updated"))
})

export const removeFromCart = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const cart = await Cart.findOne({ user: req.user.id })
  if (!cart) return next(new ApiError(404, "Cart not found"))

  cart.items = cart.items.filter((i) => i.product.toString() !== req.params.productId)
  await cart.save()
  res.json(ApiResponse.success(cart, "Item removed from cart"))
})

export const clearCart = asyncHandler(async (req: any, res: Response) => {
  const cart = await Cart.findOne({ user: req.user.id })
  if (cart) { cart.items = []; await cart.save() }
  res.json(ApiResponse.success({}, "Cart cleared"))
})
