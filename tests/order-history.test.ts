import { historyMessage } from "@/lib/orders/status";
import { it, expect } from "vitest";
it("order history drops printer codes from older messages", () => {
  expect(historyMessage({ at: "", status: "delivered", message: "Delivered (status check: DELIVERED)" })).toBe("Delivered");
  expect(historyMessage({ at: "", status: "created", message: "With the printer (print job created: PRODUCTION_DELAYED) Paid. The test printer starts soon." })).toBe("With the printer. Paid. The test printer starts soon.");
  expect(historyMessage({ at: "", status: "created", message: "With the printer (webhook)" })).toBe("With the printer");
  expect(historyMessage({ at: "", status: "paid", message: "Payment received ($5.00 in credits)" })).toBe("Payment received ($5.00 in credits)");
  expect(historyMessage({ at: "", status: "refunded", message: "Refunded (re_123)" })).toBe("Refunded (re_123)");
});
