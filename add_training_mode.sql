-- Ejecuta este script en el editor SQL de Supabase

-- 1. Añadir la columna a la tabla profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS training_mode_enabled BOOLEAN DEFAULT true;

-- Opcional: Si usas la tabla 'users' directamente en lugar de 'profiles', usa esto:
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS training_mode_enabled BOOLEAN DEFAULT true;

-- 2. Asegurarnos de que las políticas RLS permitan al usuario actualizar su propio perfil
-- (Esto asumiendo que ya tienes una política de UPDATE para el usuario, si no, puedes crearla así:)
-- CREATE POLICY "Users can update own profile" ON public.profiles
-- FOR UPDATE USING (auth.uid() = id);