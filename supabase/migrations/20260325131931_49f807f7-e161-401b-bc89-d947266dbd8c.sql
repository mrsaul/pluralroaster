
-- Allow roaster role to read orders
CREATE POLICY "Roasters can read all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'roaster'::app_role));

-- Allow roaster role to update is_roasted and status
CREATE POLICY "Roasters can update roasting status"
ON public.orders
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'roaster'::app_role))
WITH CHECK (has_role(auth.uid(), 'roaster'::app_role));

-- Allow packaging role to read orders
CREATE POLICY "Packaging can read all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'packaging'::app_role));

-- Allow packaging role to update order status and checklist
CREATE POLICY "Packaging can update orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'packaging'::app_role))
WITH CHECK (has_role(auth.uid(), 'packaging'::app_role));

-- Allow roaster role to read order items
CREATE POLICY "Roasters can read all order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'roaster'::app_role));

-- Allow packaging role to read order items
CREATE POLICY "Packaging can read all order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'packaging'::app_role));

-- Allow roaster to insert status history
CREATE POLICY "Roasters can insert status history"
ON public.order_status_history
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'roaster'::app_role));

-- Allow packaging to insert status history
CREATE POLICY "Packaging can insert status history"
ON public.order_status_history
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'packaging'::app_role));
