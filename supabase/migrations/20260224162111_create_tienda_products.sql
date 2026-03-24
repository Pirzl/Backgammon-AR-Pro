-- Create the table for Amazon shop products
CREATE TABLE IF NOT EXISTS public.tienda_products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    asin TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    price TEXT NOT NULL,
    rating TEXT NOT NULL,
    image_url TEXT NOT NULL,
    ordered_position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.tienda_products ENABLE ROW LEVEL SECURITY;

-- Read access for all users
CREATE POLICY "Enable read access for all users" ON public.tienda_products 
    FOR SELECT USING (true);

-- Admin full access
CREATE POLICY "Enable all access for admins" ON public.tienda_products 
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Add initial data requested by the user
INSERT INTO public.tienda_products (asin, title, price, rating, image_url, ordered_position) VALUES
('B0DPW3TY8C', 'Backgammon Premium Set (Modelo 1)', '79.99€', '4.8/5', 'https://m.media-amazon.com/images/I/81I-u8sI5cL._AC_SL1500_.jpg', 1),
('B005OTSTUA', 'Backgammon Premium Set (Modelo 2)', '89.99€', '4.7/5', 'https://m.media-amazon.com/images/I/91r4uGOK02L._AC_SL1500_.jpg', 2),
('B0DRP8V91G', 'Backgammon Premium Set (Modelo 3)', '65.50€', '4.9/5', 'https://m.media-amazon.com/images/I/71wLpWk9M5L._AC_SL1500_.jpg', 3),
('B0989FZ3N6', 'Backgammon Premium Set (Modelo 4)', '110.00€', '4.9/5', 'https://m.media-amazon.com/images/I/81W27-K8s4S._AC_SL1500_.jpg', 4)
ON CONFLICT (asin) DO NOTHING;
