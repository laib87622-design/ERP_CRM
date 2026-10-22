CREATE POLICY service_clients_delete_authenticated
ON public.service_clients
FOR DELETE
TO authenticated
USING (true);
