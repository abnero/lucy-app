-- Allow users to delete their own profile (needed for waitlist gate cleanup)
CREATE POLICY "Users can delete own profile"
  ON usuarios FOR DELETE USING (auth.uid() = id);
