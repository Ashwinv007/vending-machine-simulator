import { customAlphabet } from "nanoid";

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const randomPart = customAlphabet(alphabet, 10);

export function generateOrderId() {
  return `ORD_${randomPart()}`;
}
