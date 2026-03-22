/**
 * Example: E-commerce Shop Bot with Cloud API
 *
 * A complete shopping bot that demonstrates:
 * - Product browsing with list messages
 * - Cart management with button messages
 * - Order confirmation with templates
 * - Location sharing for delivery
 *
 * This example shows real-world usage of WaSP's Cloud API provider
 */

import { WaSP, CloudAPIProvider } from '../src/index.js';

// Simple in-memory cart (in production, use Redis or database)
const carts = new Map<string, Array<{ id: string; name: string; price: number; quantity: number }>>();

// Product catalog
const products = {
  electronics: [
    { id: 'phone1', name: 'Samsung Galaxy S24', price: 15999, stock: 5 },
    { id: 'phone2', name: 'iPhone 15 Pro', price: 24999, stock: 3 },
    { id: 'laptop1', name: 'Dell XPS 15', price: 28999, stock: 2 },
    { id: 'laptop2', name: 'MacBook Air M3', price: 22999, stock: 4 },
  ],
  accessories: [
    { id: 'case1', name: 'Phone Case', price: 299, stock: 20 },
    { id: 'charger1', name: 'Fast Charger', price: 499, stock: 15 },
    { id: 'headphones1', name: 'Wireless Earbuds', price: 1999, stock: 10 },
  ],
};

async function main() {
  const wasp = new WaSP({
    defaultProvider: 'CLOUD_API',
    debug: true,
  });

  const sessionId = 'shop-bot';

  // Create session
  await wasp.createSession(sessionId, 'CLOUD_API', {
    accessToken: process.env.META_ACCESS_TOKEN || 'YOUR_ACCESS_TOKEN',
    phoneNumberId: process.env.META_PHONE_NUMBER_ID || '123456789012345',
  });

  console.log('🛍️ Shop Bot Started!\n');

  // Message handler
  wasp.on('MESSAGE_RECEIVED', async (event) => {
    const message = event.data;
    const from = message.from;
    const content = message.content.toLowerCase();

    console.log(`📩 Message from ${from}: ${message.content}`);

    // Initialize cart if needed
    if (!carts.has(from)) {
      carts.set(from, []);
    }

    // Handle text commands
    if (message.type === 'TEXT') {
      if (content.includes('hello') || content.includes('hi') || content === 'start') {
        await sendWelcomeMessage(wasp, sessionId, from);
      } else if (content.includes('menu') || content.includes('shop') || content.includes('browse')) {
        await sendProductMenu(wasp, sessionId, from);
      } else if (content.includes('cart')) {
        await sendCart(wasp, sessionId, from);
      } else if (content.includes('help')) {
        await sendHelp(wasp, sessionId, from);
      } else {
        await sendWelcomeMessage(wasp, sessionId, from);
      }
    }

    // Handle button replies
    if (message.raw?.interactive?.button_reply) {
      const buttonId = message.raw.interactive.button_reply.id;
      await handleButtonClick(wasp, sessionId, from, buttonId);
    }

    // Handle list replies (product selection)
    if (message.raw?.interactive?.list_reply) {
      const listId = message.raw.interactive.list_reply.id;
      const listTitle = message.raw.interactive.list_reply.title;
      await handleProductSelection(wasp, sessionId, from, listId, listTitle);
    }
  });
}

async function sendWelcomeMessage(wasp: WaSP, sessionId: string, to: string) {
  await wasp.sendMessage(sessionId, to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      header: {
        type: 'text',
        text: '🛍️ Welcome to TechShop!',
      },
      body: {
        text: 'Your one-stop shop for electronics and accessories. What would you like to do today?',
      },
      footer: {
        text: 'Powered by WaSP Cloud API',
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'browse', title: '📱 Browse Products' } },
          { type: 'reply', reply: { id: 'cart', title: '🛒 View Cart' } },
          { type: 'reply', reply: { id: 'help', title: '❓ Help' } },
        ],
      },
    },
  });
}

async function sendProductMenu(wasp: WaSP, sessionId: string, to: string) {
  await wasp.sendMessage(sessionId, to, {
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: '📱 Our Products',
      },
      body: {
        text: 'Browse our categories and select a product to add to your cart:',
      },
      footer: {
        text: 'All prices in ZAR',
      },
      action: {
        button: 'View Products',
        sections: [
          {
            title: '📱 Electronics',
            rows: products.electronics.map((p) => ({
              id: p.id,
              title: p.name,
              description: `R${p.price.toLocaleString()} • ${p.stock} in stock`,
            })),
          },
          {
            title: '🎧 Accessories',
            rows: products.accessories.map((p) => ({
              id: p.id,
              title: p.name,
              description: `R${p.price.toLocaleString()} • ${p.stock} in stock`,
            })),
          },
        ],
      },
    },
  });
}

async function handleProductSelection(
  wasp: WaSP,
  sessionId: string,
  from: string,
  productId: string,
  productName: string
) {
  // Find product
  const allProducts = [...products.electronics, ...products.accessories];
  const product = allProducts.find((p) => p.id === productId);

  if (!product) {
    await wasp.sendMessage(sessionId, from, '❌ Product not found. Please try again.');
    return;
  }

  if (product.stock === 0) {
    await wasp.sendMessage(sessionId, from, `❌ Sorry, ${product.name} is out of stock.`);
    return;
  }

  // Add to cart
  const cart = carts.get(from)!;
  const existingItem = cart.find((item) => item.id === productId);

  if (existingItem) {
    existingItem.quantity++;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      quantity: 1,
    });
  }

  // Confirm addition
  await wasp.sendMessage(sessionId, from, {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `✅ Added ${product.name} to your cart!\n\nPrice: R${product.price.toLocaleString()}\nQuantity: ${existingItem ? existingItem.quantity : 1}`,
      },
      footer: {
        text: `Cart total: ${cart.length} item(s)`,
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'browse', title: '➕ Add More' } },
          { type: 'reply', reply: { id: 'cart', title: '🛒 View Cart' } },
          { type: 'reply', reply: { id: 'checkout', title: '✅ Checkout' } },
        ],
      },
    },
  });
}

async function sendCart(wasp: WaSP, sessionId: string, to: string) {
  const cart = carts.get(to)!;

  if (cart.length === 0) {
    await wasp.sendMessage(sessionId, to, {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: '🛒 Your cart is empty!\n\nStart shopping to add items to your cart.',
        },
        action: {
          buttons: [{ type: 'reply', reply: { id: 'browse', title: '📱 Browse Products' } }],
        },
      },
    });
    return;
  }

  // Calculate totals
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const delivery = 99;
  const total = subtotal + delivery;

  // Format cart items
  const items = cart
    .map(
      (item) =>
        `• ${item.name}\n  R${item.price.toLocaleString()} × ${item.quantity} = R${(item.price * item.quantity).toLocaleString()}`
    )
    .join('\n\n');

  await wasp.sendMessage(sessionId, to, {
    type: 'interactive',
    interactive: {
      type: 'button',
      header: {
        type: 'text',
        text: '🛒 Your Cart',
      },
      body: {
        text: `${items}\n\n━━━━━━━━━━━━━━━━\nSubtotal: R${subtotal.toLocaleString()}\nDelivery: R${delivery}\n━━━━━━━━━━━━━━━━\n*Total: R${total.toLocaleString()}*`,
      },
      footer: {
        text: `${cart.length} item(s)`,
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'checkout', title: '✅ Checkout' } },
          { type: 'reply', reply: { id: 'clear', title: '🗑️ Clear Cart' } },
          { type: 'reply', reply: { id: 'browse', title: '➕ Add More' } },
        ],
      },
    },
  });
}

async function handleButtonClick(wasp: WaSP, sessionId: string, from: string, buttonId: string) {
  switch (buttonId) {
    case 'browse':
      await sendProductMenu(wasp, sessionId, from);
      break;

    case 'cart':
      await sendCart(wasp, sessionId, from);
      break;

    case 'help':
      await sendHelp(wasp, sessionId, from);
      break;

    case 'clear':
      carts.set(from, []);
      await wasp.sendMessage(sessionId, from, '🗑️ Cart cleared!');
      await sendWelcomeMessage(wasp, sessionId, from);
      break;

    case 'checkout':
      await handleCheckout(wasp, sessionId, from);
      break;

    case 'confirm_order':
      await confirmOrder(wasp, sessionId, from);
      break;

    case 'cancel_order':
      await wasp.sendMessage(sessionId, from, '❌ Order cancelled.');
      await sendWelcomeMessage(wasp, sessionId, from);
      break;

    default:
      await sendWelcomeMessage(wasp, sessionId, from);
  }
}

async function handleCheckout(wasp: WaSP, sessionId: string, from: string) {
  const cart = carts.get(from)!;

  if (cart.length === 0) {
    await wasp.sendMessage(sessionId, from, '🛒 Your cart is empty!');
    return;
  }

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const total = subtotal + 99;

  await wasp.sendMessage(sessionId, from, {
    type: 'interactive',
    interactive: {
      type: 'button',
      header: {
        type: 'text',
        text: '📦 Order Summary',
      },
      body: {
        text: `You are about to place an order for R${total.toLocaleString()}.\n\nDelivery time: 2-3 business days\nPayment: Cash on delivery\n\nPlease share your delivery location in the next message, or confirm to use your registered address.`,
      },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'confirm_order', title: '✅ Confirm Order' } },
          { type: 'reply', reply: { id: 'cancel_order', title: '❌ Cancel' } },
        ],
      },
    },
  });
}

async function confirmOrder(wasp: WaSP, sessionId: string, from: string) {
  const cart = carts.get(from)!;
  const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;

  // Clear cart
  carts.set(from, []);

  // Send confirmation
  await wasp.sendMessage(
    sessionId,
    from,
    `✅ *Order Confirmed!*\n\nOrder Number: ${orderNumber}\n\nThank you for shopping with TechShop! We'll deliver your order within 2-3 business days.\n\nYou will receive tracking updates via WhatsApp.`
  );

  // Send store location
  await wasp.sendMessage(sessionId, from, {
    type: 'location',
    location: {
      latitude: -33.9249,
      longitude: 18.4241,
      name: 'TechShop Store',
      address: '123 Main St, Cape Town, South Africa',
    },
  });

  // Send support contact
  await wasp.sendMessage(sessionId, from, {
    type: 'contacts',
    contacts: [
      {
        name: {
          formatted_name: 'TechShop Support',
          first_name: 'TechShop',
          last_name: 'Support',
        },
        phones: [{ phone: '+27215551234', type: 'WORK' }],
        emails: [{ email: 'support@techshop.co.za', type: 'WORK' }],
      },
    ],
  });

  // Return to menu
  setTimeout(() => {
    sendWelcomeMessage(wasp, sessionId, from);
  }, 3000);
}

async function sendHelp(wasp: WaSP, sessionId: string, to: string) {
  await wasp.sendMessage(
    sessionId,
    to,
    `❓ *Help & Commands*\n\n` +
      `• Type "hello" or "start" - Welcome message\n` +
      `• Type "menu" or "browse" - View products\n` +
      `• Type "cart" - View your cart\n` +
      `• Click buttons to navigate\n` +
      `• Select from lists to add products\n\n` +
      `*Need assistance?*\n` +
      `Contact support: +27 21 555 1234\n` +
      `Email: support@techshop.co.za\n\n` +
      `*Business Hours:*\n` +
      `Mon-Fri: 9am - 6pm\n` +
      `Sat: 9am - 2pm\n` +
      `Sun: Closed`
  );

  setTimeout(() => {
    sendWelcomeMessage(wasp, sessionId, to);
  }, 2000);
}

// Run the bot
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
