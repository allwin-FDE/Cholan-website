import { PageHead } from '../../shared/ui.jsx';

// Help for the plant dashboard (/warehouse): the day's work, step by step.
const SECTIONS = [
  {
    title: 'Signing in',
    steps: [
      'Go to www.cholanrice.in/warehouse.',
      'Click “Continue with Google” and choose the Google account an admin added for you (with Plant or Both access).',
      'You stay signed in on that device until you click the sign-out button at the bottom of the menu.',
      'What you can do depends on your role: Viewer looks, Editor (staff) does the daily work, Admin also approves, cancels and reverses.',
    ],
  },
  {
    title: 'Today',
    steps: [
      'The first screen shows what needs doing: orders to confirm, to pack and to dispatch, what is on the road, packs out of stock or running low, goods received without a bill, and money overdue.',
      'Click any box to open the page where that work is done.',
    ],
  },
  {
    title: 'Orders: confirm, pack, dispatch',
    steps: [
      'Website orders come in by themselves. For phone, WhatsApp or walk-in orders, click “New order”, choose the customer and the packs.',
      'Confirm the order: credit and stock are checked, and the bags are kept aside for it. An order over the customer’s credit needs an Admin.',
      'When packing starts, click “Start packing”, then “Packed” when the bags are ready.',
      'Dispatch it from the order: type the vehicle number, driver and phone, and the LR or e-way bill if there is one. Dispatch takes the bags out of stock and makes the GST invoice.',
      'Open the invoice to print it or save it as PDF for the driver.',
    ],
  },
  {
    title: 'Delivery',
    steps: [
      '“Ready to dispatch” lists packed orders waiting for a vehicle. Click Dispatch to fill in the vehicle and driver.',
      '“On the road” lists dispatched orders, with the vehicle, the driver’s phone (tap to call) and how many days it has been out. Over 3 days shows in red.',
      'When the driver or customer confirms delivery, click Delivered.',
      '“To collect on delivery” is what is still unpaid on the orders on the road.',
    ],
  },
  {
    title: 'Stock',
    steps: [
      'Stock shows every pack: in the godown, kept aside for orders, free to sell, and damaged.',
      'Stock comes in through Purchases → Goods received. For stock already in the godown, or a count that is off, open the pack and add an adjustment with a reason (Admin).',
      'A pack with no free stock shows as “Out of stock” on the website and cannot be ordered there.',
    ],
  },
  {
    title: 'Buying stock and paying suppliers',
    steps: [
      'Add the supplier once, under Customers and suppliers (tick Supplier, and give their usual payment terms in days).',
      'Optional: under Purchases, “Purchase order” records what you ordered (Admin and Owner).',
      'When the goods arrive, click “Goods received”. Choose the supplier and, if there is one, the purchase order, which fills in what is still to come. Type how many arrived and how many you accepted; give a reason for any rejected. The accepted bags go into stock at once, as a batch.',
      'When their bill comes, open the goods received and click “Enter the bill for this”: the items and the order’s rates are filled in. Check them against the paper bill, type the bill number, and the total printed on the bill so mistakes are caught.',
      'To pay, click “Pay a supplier”. It pays their oldest bill first, or choose the bills. UPI, bank and cheque payments need the reference number.',
      '“Owed to suppliers” shows what you owe each one, by age. Click a supplier to see their unpaid bills and payments. A wrong bill or payment is cancelled or reversed with a reason (Admin and Owner); nothing is deleted.',
    ],
  },
  {
    title: 'Recording expenses',
    steps: [
      'Expenses are money spent that is not stock: rent, wages, diesel, electricity, repairs.',
      'Click “Add expense”, choose what it was for, type the amount before GST and the GST rate, and add a photo of the bill (on a phone it opens the camera). A photo can also be added later from the list.',
      'The bill photos are private: only people signed in to the admin can open them.',
      'Choose the dates at the top to see the total spent, by category. Download gives the list as a spreadsheet for the accountant.',
      'Admin and Owner can add categories, and set the Tally ledger each one goes to.',
    ],
  },
  {
    title: 'Money received',
    steps: [
      'Payments and dues shows what each customer owes, by age. Click “Record payment” when money comes in by cash, UPI, bank or cheque.',
      'Online payments lists what customers paid on the website through Razorpay; those are recorded by themselves. A refund is given from there (Admin).',
    ],
  },
];

export default function PlantHelp() {
  return (
    <div className="dash-page">
      <PageHead title="Help" intro="How to use the plant dashboard, step by step." range={false} />
      <nav className="dash-help-toc" aria-label="Topics">
        {SECTIONS.map((s, i) => (
          <a key={s.title} href={`#help-${i}`}>
            {s.title}
          </a>
        ))}
      </nav>
      <div className="dash-help">
        {SECTIONS.map((s, i) => (
          <section key={s.title} id={`help-${i}`} className="dash-card">
            <h2>{s.title}</h2>
            <ol>
              {s.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
