/** The Shipping page. Written from Lulu's published shipping help and API docs (checked November 2026) and from how the app's checkout really works. Bracketed text is for the owner to fill in. */
import type { LegalPage } from "./types";

export const SHIPPING: LegalPage = {
  "title": "Shipping and delivery",
  "description": "How StoryStar books are printed to order by our print partner Lulu, the delivery options you can choose, how shipping is priced and what to do if a book is late or damaged.",
  "lede": "Every StoryStar book is printed just for your star after you order it. Our print partner Lulu prints it, binds it and sends it to your door. Here is how long that takes, the ways it can travel, what it costs and what to do if anything goes wrong.",
  "short": [
    "Every book is printed to order by our print partner Lulu. Lulu says printing usually takes 3 to 5 business days, and hardcovers can take a little longer.",
    "You choose how it travels. Checkout lists the options for your address from cheapest to most expensive, each with its total price and the dates it should arrive.",
    "The Shipping line at checkout is exactly what the printer charges us to send your book. We don't mark it up.",
    "We email you when your order is confirmed, when it ships and when the carrier reports it delivered.",
    "If your book arrives damaged or misprinted, send us photos within [REPORT WINDOW DAYS] days of the date it shipped and we will ask the printer to replace it.",
    "Please check the address and every page of the book before you pay. Once you pay, your order goes straight to the printer and can't be changed on our site."
  ],
  "sections": [
    {
      "id": "printed-to-order",
      "heading": "Printed to order",
      "paragraphs": [
        "Each StoryStar book is made only after you order it. As soon as you pay, we send your book's print files to our print partner Lulu. Lulu prints and binds it at its print site closest to the delivery address, then hands it to the carrier. Neither the print site nor the carrier can be chosen.",
        "Lulu says printing usually takes 3 to 5 business days. Hardcovers can take a little longer because the binding needs time to cure. Printing can't be sped up, even with a faster delivery option.",
        "Busy seasons like the holidays and back to school can be slower. If the book is a gift for a special day, order early and choose an option whose latest arrival date comes before that day. Arrival dates are the printer's estimates, not a promise."
      ],
      "bullets": []
    },
    {
      "id": "ways-your-book-can-travel",
      "heading": "Ways your book can travel",
      "paragraphs": [
        "The printer tells us which delivery options can reach your address, so the list you see depends on where the book is going. Checkout shows them from cheapest to most expensive, with the dates each one should arrive.",
        "The table describes each option the way the printer does, with travel time counted after printing. The relative price is a rough guide: faster options usually cost more. Real prices depend on the address and change over time, so checkout always shows your real options and prices before you pay."
      ],
      "bullets": [
        "Most options come with tracking. Standard mail and Priority mail may travel without tracking to some places.",
        "Expedited and Express deliver Monday to Friday only.",
        "For a US PO box or a military APO, FPO or DPO address, choose Standard mail or Priority mail. Ground, Expedited and Express can't deliver there."
      ],
      "table": {
        "columns": [
          "Option",
          "What it is",
          "Travel time after printing",
          "Relative price"
        ],
        "rows": [
          [
            "Standard mail",
            "Postal mail. The slowest option.",
            "The slowest. Without tracking it can take up to 28 days.",
            "$"
          ],
          [
            "Priority mail",
            "Priority postal mail.",
            "Quicker than Standard mail. Without tracking it can still take up to 28 days.",
            "$$"
          ],
          [
            "Ground",
            "Courier delivery by road in the US. You may see it as Ground (home delivery) or Ground (business).",
            "Shown at checkout as dates for your address.",
            "$$"
          ],
          [
            "Expedited (2-day)",
            "Second day delivery by air or similar.",
            "About 2 days. Monday to Friday only.",
            "$$$"
          ],
          [
            "Express (overnight)",
            "The fastest option.",
            "Overnight. Monday to Friday only.",
            "$$$$"
          ]
        ]
      }
    },
    {
      "id": "what-shipping-costs",
      "heading": "What shipping costs",
      "paragraphs": [
        "The Shipping line at checkout is exactly what the printer charges us to send your book. We don't add a markup.",
        "You see the shipping price for your address and option before you pay. Prices are in US dollars. Any tax the printer charges on shipping is included in that line, and checkout shows how much tax your total includes.",
        "We check prices again when you go to pay, and the payment page shows the final amount. If an option is no longer offered for your address, we ask you to choose again. Changing the address means getting new prices."
      ],
      "bullets": []
    },
    {
      "id": "where-we-ship",
      "heading": "Where we ship",
      "paragraphs": [
        "Right now we ship to the United States, Canada, the United Kingdom, Ireland, Australia, New Zealand, Germany, France, Spain, Italy, the Netherlands, Sweden and Mexico.",
        "If the printer can't deliver to an address, checkout tells you and asks you to check the country and postcode."
      ],
      "bullets": []
    },
    {
      "id": "customs-duties-and-taxes",
      "heading": "Customs duties and taxes",
      "paragraphs": [
        "Your checkout total includes any tax the printer charges, and shows how much.",
        "If a book crosses a border to reach you, the destination country may charge customs duties, import taxes or handling fees. These may not be included in your checkout total. The printer's policy is that they are the recipient's responsibility, so the person receiving the book may be asked to pay them.",
        "Sending a book abroad as a gift? Let the recipient know so a fee doesn't come as a surprise."
      ],
      "bullets": []
    },
    {
      "id": "getting-the-address-right",
      "heading": "Getting the address right",
      "paragraphs": [
        "Please check every line of the address before you pay. The carrier needs a phone number for delivery, so we ask for one.",
        "The printer checks each address. If something looks off, we show it under Please check the address, and you can switch to the printer's version with the Use the printer's suggested address button.",
        "The printer allows up to 35 characters for the name and 30 for each street line and the city. Put an apartment or unit number on the second line.",
        "Once you pay, your book goes to the printer straight away and the address can't be changed on our site. If you spot a mistake, write to us at once at [CONTACT EMAIL]. We will try to fix it with the printer, but we can't promise, and once printing starts an order can't be changed or cancelled."
      ],
      "bullets": []
    },
    {
      "id": "sending-a-book-as-a-gift",
      "heading": "Sending a book as a gift",
      "paragraphs": [
        "You can send a book straight to the person it's for. Use their name and address, and a phone number the carrier can call."
      ],
      "bullets": [
        "The packing slip shows the book title, the recipient's name and address and the order number. It shows no prices and nothing about who ordered it.",
        "The printer can't add a note to the box. To include a message, write it on the book's dedication page before you make the print files.",
        "Each order ships to one address. To send books to two homes, place two orders."
      ]
    },
    {
      "id": "following-your-order",
      "heading": "Following your order",
      "paragraphs": [
        "Your order page shows each step: Paid, With the printer, Printing, Shipped and Delivered. Right after you pay, the printer waits a short while before printing starts.",
        "Once your book ships, the page shows the carrier and the tracking number with a tracking link when the carrier provides them, plus the estimated arrival date. The page updates on its own, and the Check status now button asks the printer for the latest.",
        "Tracking can take up to 48 hours to start moving after the shipping email. Some carriers never send a delivered update, so your order may still say Shipped after the book has arrived.",
        "If you add a recipient email with the address, we pass it to the printer with the delivery details. We can't control whether the printer or the carrier uses it to send updates.",
        "We email you at your account address when:"
      ],
      "bullets": [
        "Your order is confirmed and on its way to the printer.",
        "Your book ships, with the tracking link or number.",
        "The carrier reports it delivered.",
        "Something needs fixing before your book can be printed."
      ]
    },
    {
      "id": "lost-or-late-packages",
      "heading": "Lost or late packages",
      "paragraphs": [
        "If tracking hasn't moved for a while, or your book hasn't arrived by the latest date you were given, write to us at [CONTACT EMAIL] with your order number and we will take it up with the printer for you. Please tell us no later than [LOST BOOK WINDOW DAYS] days after it shipped.",
        "Wrong addresses, customs checks, natural disasters and other events outside anyone's control can hold a package up.",
        "The printer decides on replacements for packages that don't arrive. A book sent by Standard mail or Priority mail without tracking can take up to 28 days. If it still hasn't arrived after that, the printer may send a replacement at its discretion, and it won't send more than one. For other options, tell us if your book has been on its way for more than 14 days.",
        "If a book can't be delivered because the address was wrong, [WRONG ADDRESS POLICY]."
      ],
      "bullets": []
    },
    {
      "id": "damaged-or-misprinted-books",
      "heading": "Damaged or misprinted books",
      "paragraphs": [
        "Our printer is responsible for the quality of the printing. If your book arrives damaged, has a printing or binding fault, or the wrong item is in the box, we will ask the printer for a replacement copy. The printer decides each case from photos of the problem.",
        "Because each book is printed only for your star, the printer doesn't take returns. It reviews damaged and faulty books for a replacement instead. This doesn't affect any rights you have under your local consumer law.",
        "To report a problem, write to us at [CONTACT EMAIL] within [REPORT WINDOW DAYS] days of the date your book shipped. Your order page shows that date. Please don't wait, because the printer has its own deadline for reports.",
        "Keep the book and its box until you hear back from us. The printer reviews damage from photos, so you don't need to send the book anywhere.",
        "Please include:"
      ],
      "bullets": [
        "Your order number.",
        "Clear photos of the problem, taken with a phone or camera in good light rather than scanned.",
        "A photo of the packing slip if the wrong item arrived."
      ]
    },
    {
      "id": "printing-problems-and-normal-variation",
      "heading": "Printing problems and normal variation",
      "paragraphs": [
        "The printer checks each report by comparing your book with the print files it was made from, not with how it looked on your screen.",
        "What's in the book is yours to check. A spelling mistake, a name typed wrong or a picture you approved is not a printing fault, because the printer prints the book exactly as it was when you ordered. Please read every page before you pay.",
        "Not sure whether something is a fault? Send us a photo and we will take a look.",
        "Small differences are a normal part of printing on demand and aren't faults:"
      ],
      "bullets": [
        "Colors that look a little different from your screen, or from another copy.",
        "Words or pictures sitting very slightly off from where they were on screen.",
        "Pictures or words sitting very slightly off from where they were on screen."
      ]
    },
    {
      "id": "when-the-printer-needs-a-fix",
      "heading": "When the printer needs a fix",
      "paragraphs": [
        "Your print files are checked with the printer when you make them, which catches most problems before you pay. Now and then the printer still can't print a book. If that happens, your order shows Needs a fix with the printer's reason, and we email you.",
        "Correct the book if needed, make new print files and send the order again. You won't be charged again. If you would rather not, write to us and we will refund the order in full, unless it was refused for breaking the rules in our [Terms](/terms)."
      ],
      "bullets": []
    },
    {
      "id": "questions",
      "heading": "Questions",
      "paragraphs": [
        "Write to us at [CONTACT EMAIL] with your order number and we will help. You can follow your order any time on its order page in [Your orders](/orders). Our [Terms](/terms) cover the full rules for orders, refunds and claims, and they apply if this page and the Terms ever differ."
      ],
      "bullets": []
    }
  ],
  "placeholders": [
    "[CONTACT EMAIL]",
    "[LOST BOOK WINDOW DAYS]",
    "[REPORT WINDOW DAYS]",
    "[WRONG ADDRESS POLICY]"
  ]
};
