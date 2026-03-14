local function get_attr(el, key)
  if not el or not el.attributes then
    return nil
  end
  local value = el.attributes[key]
  if value == nil or value == "" then
    return nil
  end
  return value
end

local function get_layout_value(el, base)
  return get_attr(el, base) or get_attr(el, "data-" .. base)
end

local function append_css_rule(existing, rule)
  if not rule or rule == "" then
    return existing
  end
  if not existing or existing == "" then
    return rule
  end
  if existing:match(rule, 1, true) then
    return existing
  end
  return existing .. " " .. rule
end

local function apply_html_styles(el)
  local space_before = get_layout_value(el, "space-before")
  local space_after = get_layout_value(el, "space-after")
  local inset_left = get_layout_value(el, "inset-left")
  local inset_right = get_layout_value(el, "inset-right")
  local first_line_indent = get_layout_value(el, "first-line-indent")
  local align = get_layout_value(el, "align")
  local keep_together = get_layout_value(el, "keep-together")
  local page_break = get_layout_value(el, "page-break")

  if not space_before and not space_after and not inset_left and not inset_right and not first_line_indent and not align and not keep_together and not page_break then
    return nil
  end

  local style = get_attr(el, "style") or ""
  if space_before then
    style = append_css_rule(style, "margin-top:" .. space_before .. ";")
  end
  if space_after then
    style = append_css_rule(style, "margin-bottom:" .. space_after .. ";")
  end
  if inset_left then
    style = append_css_rule(style, "margin-left:" .. inset_left .. ";")
  end
  if inset_right then
    style = append_css_rule(style, "margin-right:" .. inset_right .. ";")
  end
  if first_line_indent then
    style = append_css_rule(style, "text-indent:" .. first_line_indent .. ";")
  end
  if align == "left" or align == "center" or align == "right" then
    style = append_css_rule(style, "text-align:" .. align .. ";")
  end
  if keep_together == "true" then
    style = append_css_rule(style, "break-inside:avoid;")
    style = append_css_rule(style, "page-break-inside:avoid;")
  end
  if page_break == "true" then
    style = append_css_rule(style, "break-before:page;")
    style = append_css_rule(style, "page-break-before:always;")
  end

  if style ~= "" then
    el.attributes["style"] = style
  end
  return el
end

local function latex_alignment_command(align)
  if align == "left" then
    return "\\raggedright"
  end
  if align == "center" then
    return "\\centering"
  end
  if align == "right" then
    return "\\raggedleft"
  end
  return nil
end

local function apply_latex_layout(block)
  local space_before = get_layout_value(block, "space-before")
  local space_after = get_layout_value(block, "space-after")
  local inset_left = get_layout_value(block, "inset-left")
  local inset_right = get_layout_value(block, "inset-right")
  local first_line_indent = get_layout_value(block, "first-line-indent")
  local align = get_layout_value(block, "align")
  local keep_together = get_layout_value(block, "keep-together")
  local page_break = get_layout_value(block, "page-break")

  if not space_before and not space_after and not inset_left and not inset_right and not first_line_indent and not align and not keep_together and not page_break then
    return nil
  end

  local blocks = {}
  if page_break == "true" then
    table.insert(blocks, pandoc.RawBlock("latex", "\\newpage"))
  end
  if space_before then
    table.insert(blocks, pandoc.RawBlock("latex", "\\vspace*{" .. space_before .. "}"))
  end

  local wrapper = { "\\begingroup" }
  if keep_together == "true" then
    table.insert(wrapper, "\\begin{samepage}")
  end
  if inset_left then
    table.insert(wrapper, "\\leftskip=" .. inset_left)
  end
  if inset_right then
    table.insert(wrapper, "\\rightskip=" .. inset_right)
  end
  if first_line_indent then
    table.insert(wrapper, "\\parindent=" .. first_line_indent)
  end
  local align_command = latex_alignment_command(align)
  if align_command then
    table.insert(wrapper, align_command)
  end

  local needs_wrapper = #wrapper > 1
  if needs_wrapper then
    table.insert(blocks, pandoc.RawBlock("latex", table.concat(wrapper, "\n")))
  end

  table.insert(blocks, block)

  if needs_wrapper then
    if keep_together == "true" then
      table.insert(blocks, pandoc.RawBlock("latex", "\\end{samepage}"))
    end
    table.insert(blocks, pandoc.RawBlock("latex", "\\par\\endgroup"))
  end

  if space_after then
    table.insert(blocks, pandoc.RawBlock("latex", "\\vspace*{" .. space_after .. "}"))
  end

  return blocks
end

function Div(div)
  if FORMAT:match("latex") then
    return apply_latex_layout(div)
  end
  if FORMAT:match("html") or FORMAT:match("epub") or FORMAT:match("revealjs") then
    return apply_html_styles(div)
  end
  return nil
end

function Header(header)
  if FORMAT:match("latex") then
    return apply_latex_layout(header)
  end
  if FORMAT:match("html") or FORMAT:match("epub") or FORMAT:match("revealjs") then
    return apply_html_styles(header)
  end
  return nil
end
