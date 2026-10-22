CREATE OR REPLACE FUNCTION public.save_service_template_workflow(
  p_template_id uuid,
  p_title text,
  p_country_id text,
  p_visa_type_id text,
  p_professional_status text,
  p_stages jsonb
) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  stage_record JSONB;
  step_record JSONB;
  item_record JSONB;
  v_stage_id UUID;
  v_step_id UUID;
  v_item_id UUID;
  stage_ids UUID[] := ARRAY[]::UUID[];
  step_ids UUID[];
  item_ids UUID[];
  stage_index INTEGER := 0;
  step_index INTEGER;
  item_index INTEGER;
  item_price NUMERIC(12, 2);
  item_is_done BOOLEAN;
  stage_title TEXT;
  step_title TEXT;
  item_title TEXT;
BEGIN
  IF p_template_id IS NULL THEN
    RAISE EXCEPTION 'Template id is required.';
  END IF;

  IF NULLIF(BTRIM(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'Template title is required.';
  END IF;

  IF NULLIF(BTRIM(p_country_id), '') IS NULL
    OR NULLIF(BTRIM(p_visa_type_id), '') IS NULL
    OR NULLIF(BTRIM(p_professional_status), '') IS NULL THEN
    RAISE EXCEPTION 'Country, visa type, and professional status are required.';
  END IF;

  IF p_stages IS NULL OR jsonb_typeof(p_stages) <> 'array' THEN
    RAISE EXCEPTION 'Workflow stages must be a JSON array.';
  END IF;

  UPDATE service_templates
  SET title = BTRIM(p_title),
      country_id = BTRIM(p_country_id),
      visa_type_id = BTRIM(p_visa_type_id),
      professional_status = BTRIM(p_professional_status)
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template % does not exist.', p_template_id;
  END IF;

  FOR stage_record IN
    SELECT value FROM jsonb_array_elements(p_stages) AS stage_rows(value)
  LOOP
    stage_title := NULLIF(BTRIM(stage_record->>'title'), '');
    IF stage_title IS NULL THEN
      RAISE EXCEPTION 'Every stage must have a title.';
    END IF;
    IF stage_record ? 'steps' AND COALESCE(jsonb_typeof(stage_record->'steps'), 'null') <> 'array' THEN
      RAISE EXCEPTION 'Steps for stage "%" must be a JSON array.', stage_title;
    END IF;

    v_stage_id := NULLIF(stage_record->>'id', '')::UUID;
    IF v_stage_id IS NOT NULL THEN
      IF v_stage_id = ANY(stage_ids) THEN
        RAISE EXCEPTION 'Stage id % appears more than once.', v_stage_id;
      END IF;

      UPDATE service_stages
      SET title = stage_title,
          sort_order = stage_index
      WHERE id = v_stage_id
        AND service_template_id = p_template_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Stage id % does not belong to template %.', v_stage_id, p_template_id;
      END IF;
    ELSE
      INSERT INTO service_stages (service_template_id, title, sort_order)
      VALUES (p_template_id, stage_title, stage_index)
      RETURNING id INTO v_stage_id;
    END IF;
    stage_ids := array_append(stage_ids, v_stage_id);

    step_index := 0;
    step_ids := ARRAY[]::UUID[];
    FOR step_record IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(stage_record->'steps', '[]'::jsonb)) AS step_rows(value)
    LOOP
      step_title := NULLIF(BTRIM(step_record->>'title'), '');
      IF step_title IS NULL THEN
        RAISE EXCEPTION 'Every step in stage "%" must have a title.', stage_title;
      END IF;
      IF step_record ? 'items' AND COALESCE(jsonb_typeof(step_record->'items'), 'null') <> 'array' THEN
        RAISE EXCEPTION 'Items for step "%" must be a JSON array.', step_title;
      END IF;

      v_step_id := NULLIF(step_record->>'id', '')::UUID;
      IF v_step_id IS NOT NULL THEN
        IF v_step_id = ANY(step_ids) THEN
          RAISE EXCEPTION 'Step id % appears more than once in stage %.', v_step_id, v_stage_id;
        END IF;

        UPDATE service_steps
        SET title = step_title,
            sort_order = step_index
        WHERE id = v_step_id
          AND stage_id = v_stage_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Step id % does not belong to stage %.', v_step_id, v_stage_id;
        END IF;
      ELSE
        INSERT INTO service_steps (stage_id, title, sort_order)
        VALUES (v_stage_id, step_title, step_index)
        RETURNING id INTO v_step_id;
      END IF;
      step_ids := array_append(step_ids, v_step_id);

      item_index := 0;
      item_ids := ARRAY[]::UUID[];
      FOR item_record IN
        SELECT value
        FROM jsonb_array_elements(COALESCE(step_record->'items', '[]'::jsonb)) AS item_rows(value)
      LOOP
        item_title := NULLIF(BTRIM(item_record->>'title'), '');
        IF item_title IS NULL THEN
          RAISE EXCEPTION 'Every item in step "%" must have a title.', step_title;
        END IF;

        item_price := COALESCE(NULLIF(item_record->>'estimated_price', '')::NUMERIC, 0);
        IF item_price < 0 THEN
          RAISE EXCEPTION 'Estimated price for item "%" cannot be negative.', item_title;
        END IF;
        item_is_done := COALESCE((item_record->>'is_done')::BOOLEAN, FALSE);

        v_item_id := NULLIF(item_record->>'id', '')::UUID;
        IF v_item_id IS NOT NULL THEN
          IF v_item_id = ANY(item_ids) THEN
            RAISE EXCEPTION 'Item id % appears more than once in step %.', v_item_id, v_step_id;
          END IF;

          UPDATE service_items
          SET title = item_title,
              standard_note = COALESCE(item_record->>'standard_note', ''),
              estimated_price = item_price,
              drive_url = NULLIF(item_record->>'drive_url', ''),
              is_done = item_is_done,
              sort_order = item_index
          WHERE id = v_item_id
            AND step_id = v_step_id;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'Item id % does not belong to step %.', v_item_id, v_step_id;
          END IF;
        ELSE
          INSERT INTO service_items (
            step_id,
            title,
            standard_note,
            estimated_price,
            drive_url,
            is_done,
            sort_order
          )
          VALUES (
            v_step_id,
            item_title,
            COALESCE(item_record->>'standard_note', ''),
            item_price,
            NULLIF(item_record->>'drive_url', ''),
            item_is_done,
            item_index
          )
          RETURNING id INTO v_item_id;
        END IF;
        item_ids := array_append(item_ids, v_item_id);

        item_index := item_index + 1;
      END LOOP;

      DELETE FROM service_items
      WHERE step_id = v_step_id
        AND id <> ALL(item_ids);

      step_index := step_index + 1;
    END LOOP;

    DELETE FROM service_steps
    WHERE stage_id = v_stage_id
      AND id <> ALL(step_ids);

    stage_index := stage_index + 1;
  END LOOP;

  DELETE FROM service_stages
  WHERE service_template_id = p_template_id
    AND id <> ALL(stage_ids);
END;
$$;
