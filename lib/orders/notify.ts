/**
 * Order emails to the parent who placed the order (and an alert to admins when
 * an order needs a human). Best effort: a failed email never breaks an order.
 * Each email is sent once per order and status (idempotency key).
 */
import type { Order } from "@prisma/client";
import { db } from "../db";
import { getConfig } from "../config";
import { getEmailProvider } from "../providers/registry";
import { errorMessage, log } from "../log";
import { formatMoney } from "./pricing";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function content(order: Order, status: string): { subject: string; lines: string[] } | null {
  const title = order.bookTitle || "your book";
  switch (status) {
    case "paid":
      return { subject: `Order confirmed: ${title}`, lines: [`Thank you! We've received your payment of ${formatMoney(order.totalCents, order.currency)} and we're sending "${title}" to the printer.`, "We'll email you again when it ships."] };
    case "shipped":
      return {
        subject: `On its way: ${title}`,
        lines: [`Good news: "${title}" has been printed and shipped.`, order.trackingUrl ? `Track it here: ${order.trackingUrl}` : order.trackingNumber ? `Tracking number: ${order.trackingNumber}` : "Tracking details will appear on your order page."],
      };
    case "delivered":
      return { subject: `Delivered: ${title}`, lines: [`"${title}" has been delivered. We hope it brings lots of giggles at story time!`] };
    case "rejected":
    case "failed":
      return { subject: `Your order needs a quick fix: ${title}`, lines: [`The printer couldn't print "${title}" yet. Open your order to see what to fix; sending it again doesn't cost anything extra.`] };
    default:
      return null;
  }
}

export async function notifyOrderStatus(order: Order, status: string) {
  try {
    const user = await db.user.findUnique({ where: { id: order.userId } });
    const c = content(order, status);
    if (!user || !c || user.deletedAt || user.email.endsWith(".local")) return;
    const link = `${getConfig().APP_URL.replace(/\/$/, "")}/orders/${order.id}`;
    const email = getEmailProvider();
    await email.send({
      to: user.email,
      subject: c.subject,
      text: `${c.lines.join("\n\n")}\n\nYour order: ${link}`,
      html: `${c.lines.map((l) => `<p>${esc(l)}</p>`).join("")}<p><a href="${link}">View your order</a></p>`,
      idempotencyKey: `order-${order.id}-${status}-${order.providerOrderId ?? "0"}`,
    });
    if (status === "rejected" || status === "failed") {
      const admins = (getConfig().ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
      for (const to of admins) {
        await email.send({
          to,
          subject: `[StoryStar admin] Order ${order.id.slice(-8).toUpperCase()} is ${status}`,
          text: `Reason: ${order.statusReason ?? "not given"}\n\n${link}`,
          html: `<p>Reason: ${esc(order.statusReason ?? "not given")}</p><p><a href="${link}">Open the order</a></p>`,
          idempotencyKey: `admin-${order.id}-${status}-${order.providerOrderId ?? "0"}`,
        });
      }
    }
  } catch (err) {
    log.warn("Order email failed", { orderId: order.id, status, err: errorMessage(err) });
  }
}
