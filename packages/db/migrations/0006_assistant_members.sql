-- Parents can use Wes too (assistant:use). Their runs, tool calls and the centre's usage
-- counter must be recordable under their own role; they still can't read other people's runs.
CREATE POLICY agent_runs_parent_insert ON agent_runs FOR INSERT
  WITH CHECK (app.in_centre(centre_id) AND app.role() = 'parent');
--> statement-breakpoint
CREATE POLICY tool_calls_parent_insert ON tool_calls FOR INSERT
  WITH CHECK (app.in_centre(centre_id) AND app.role() = 'parent');
--> statement-breakpoint
CREATE POLICY usage_ledger_parent ON usage_ledger FOR ALL
  USING (app.in_centre(centre_id) AND app.role() = 'parent')
  WITH CHECK (app.in_centre(centre_id) AND app.role() = 'parent');
