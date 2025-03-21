import type { CollectionAfterChangeHook } from 'payload'
import type { Order, User, Product } from '../../../payload-types'

export const sendOrderEmails: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  // Only send emails for new orders
  if (operation !== 'create') {
    return doc
  }

  const order = doc as Order
  let customerEmail: string | undefined

  try {
    // Get customer email from either user account or guest email
    if (order.orderedBy) {
      const userId = typeof order.orderedBy === 'object' && order.orderedBy !== null ? order.orderedBy.id : order.orderedBy
      try {
        const customer = await req.payload.findByID({
          collection: 'users',
          id: String(userId),
        }) as User
        customerEmail = customer?.email
      } catch (error) {
        req.payload.logger.error(`Error fetching user: ${error.message}`)
      }
    } else if (order.email) {
      customerEmail = order.email
    }

    // Send email to customer if we have their email
    if (customerEmail) {
      try {
        const emailResult = await req.payload.sendEmail({
          to: customerEmail,
          from: `"${process.env.SMTP_FROM_NAME || 'India Steel Hub'}" <${process.env.SMTP_FROM_ADDRESS || 'info@indiasteelhub.com'}>`,
          subject: `Order Confirmation #${order.id}`,
          html: `
            <h1>Thank you for your order!</h1>
            <p>Your order #${order.id} has been received and is being processed.</p>
            <h2>Order Details:</h2>
            <p>Total: $${order.total}</p>
            <h3>Items:</h3>
            <ul>
              ${(await Promise.all((order.items || []).map(async item => {
                let product: Product | null = null;
                if (typeof item.product === 'string') {
                  try {
                    product = await req.payload.findByID({
                      collection: 'products',
                      id: item.product
                    }) as Product;
                  } catch (err) {
                    req.payload.logger.error(`Failed to fetch product ${item.product}: ${err.message}`);
                  }
                } else {
                  product = item.product as Product;
                }
                return `<li>${product?.title || 'Unknown Product'} - Quantity: ${item.quantity}</li>`;
              }))).join('')}
            </ul>
          `,
        })
      } catch (error) {
        // Log the error but don't stop the order process
        req.payload.logger.error(`Failed to send customer email for order ${order.id}: ${error.message}`)
      }
    }

    // Send email to admin
    try {
      const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_FROM_ADDRESS || 'admin@example.com'
      const emailResult = await req.payload.sendEmail({
        to: adminEmail,
        from: `"${process.env.SMTP_FROM_NAME || 'India Steel Hub'}" <${process.env.SMTP_FROM_ADDRESS || 'info@indiasteelhub.com'}>`,
        subject: `New Order Received #${order.id}`,
        html: `
          <h1>New Order Received</h1>
          <p>Order #${order.id} has been received and needs to be processed.</p>
          <h2>Order Details:</h2>
          <p>Total: $${order.total}</p>
          <p>Customer: ${customerEmail || 'Guest Order (No Email)'}</p>
          <h3>Items:</h3>
          <ul>
            ${(await Promise.all((order.items || []).map(async item => {
              let product: Product | null = null;
              if (typeof item.product === 'string') {
                try {
                  product = await req.payload.findByID({
                    collection: 'products',
                    id: item.product
                  }) as Product;
                } catch (err) {
                  req.payload.logger.error(`Failed to fetch product ${item.product}: ${err.message}`);
                }
              } else {
                product = item.product as Product;
              }
              return `<li>${product?.title || 'Unknown Product'} - Quantity: ${item.quantity}</li>`;
            }))).join('')}
          </ul>
          <p>View order in admin panel: ${process.env.PAYLOAD_PUBLIC_SERVER_URL}/admin/collections/orders/${order.id}</p>
        `,
      })

    } catch (error) {
      // Log the error but don't stop the order process
      req.payload.logger.error(`Failed to send admin email for order ${order.id}: ${error.message}`)
    }
  } catch (error) {
    // Log any other errors but don't stop the order process
    req.payload.logger.error(`Error in sendOrderEmails hook: ${error.message}`)
  }

  return doc
}
