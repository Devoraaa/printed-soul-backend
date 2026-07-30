import { Router } from "express"
import { getCart, addToCart, updateCartItem, removeFromCart, clearCart } from "../controllers/cartController"
import { protect } from "../middlewares/authMiddleware"

const router = Router()

router.use(protect)
router.get("/", getCart)
router.post("/", addToCart)
router.put("/", updateCartItem)
router.delete("/clear", clearCart)
router.delete("/:productId", removeFromCart)

export default router
