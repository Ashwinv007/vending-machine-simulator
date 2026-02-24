import { webhookService } from "./webhook.service.js";

export async function handleRazorpayWebhook(req, res) {
  const signature = req.get("x-razorpay-signature");

  const result = await webhookService.processRazorpayWebhook({
    signature,
    rawBody: req.rawBody ?? JSON.stringify(req.body ?? {}),
    payload: req.body
  });

  return res.status(200).json(result);
}
