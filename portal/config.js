// Anon (publishable) key: designed to ship in a browser — it already ships in
// the SafeInspect web app bundle. It grants nothing on its own; row-level
// security is the access boundary, and supabase/tests/portal_test.sql proves
// the client-scoping. The service-role key must never appear here.
window.SAFEINSPECT_CONFIG = {
  url: "https://iyrtxfjtsxhmavujxkvx.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5cnR4Zmp0c3hobWF2dWp4a3Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNzk2MjQsImV4cCI6MjA5NjY1NTYyNH0.-H-DPyExqHP3COnWszAgUF4kGnLyo3s48s_8fBfYgr0",
};
