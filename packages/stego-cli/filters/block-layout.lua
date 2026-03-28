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
  local spacer_lines = get_layout_value(el, "spacer-lines")
  local space_before = get_layout_value(el, "space-before")
  local space_after = get_layout_value(el, "space-after")
  local inset_left = get_layout_value(el, "inset-left")
  local inset_right = get_layout_value(el, "inset-right")
  local first_line_indent = get_layout_value(el, "first-line-indent")
  local align = get_layout_value(el, "align")
  local font_family = get_layout_value(el, "font-family")
  local font_size = get_layout_value(el, "font-size")
  local line_spacing = get_layout_value(el, "line-spacing")
  local font_weight = get_layout_value(el, "font-weight")
  local italic = get_layout_value(el, "italic")
  local underline = get_layout_value(el, "underline")
  local small_caps = get_layout_value(el, "small-caps")
  local color = get_layout_value(el, "color")
  local keep_together = get_layout_value(el, "keep-together")
  local page_break = get_layout_value(el, "page-break")

  if not spacer_lines and not space_before and not space_after and not inset_left and not inset_right and not first_line_indent and not align and not font_family and not font_size and not line_spacing and not font_weight and not italic and not underline and not small_caps and not color and not keep_together and not page_break then
    return nil
  end

  local style = get_attr(el, "style") or ""
  if spacer_lines then
    local line_count = tonumber(spacer_lines)
    if line_count and line_count > 0 then
      local height
      if font_size then
        local amount = tonumber((font_size:gsub("pt$", "")))
        local spacing = tonumber(line_spacing or "1.2")
        if amount and spacing and spacing > 0 then
          height = tostring(amount * spacing * line_count) .. "pt"
        end
      end
      if not height then
        height = "calc(" .. tostring(line_count) .. " * 1lh)"
      end
      style = append_css_rule(style, "height:" .. height .. ";")
      style = append_css_rule(style, "margin:0;")
    end
  end
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
  if font_family then
    style = append_css_rule(style, "font-family:" .. font_family .. ";")
  end
  if font_size then
    style = append_css_rule(style, "font-size:" .. font_size .. ";")
  end
  if line_spacing then
    style = append_css_rule(style, "line-height:" .. line_spacing .. ";")
  end
  if font_weight then
    style = append_css_rule(style, "font-weight:" .. font_weight .. ";")
  end
  if italic == "true" then
    style = append_css_rule(style, "font-style:italic;")
  end
  if underline == "true" then
    style = append_css_rule(style, "text-decoration:underline;")
  end
  if small_caps == "true" then
    style = append_css_rule(style, "font-variant-caps:small-caps;")
  end
  if color then
    style = append_css_rule(style, "color:" .. color .. ";")
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

local function apply_html_inline_styles(span)
  local font_family = get_layout_value(span, "font-family")
  local font_size = get_layout_value(span, "font-size")
  local font_weight = get_layout_value(span, "font-weight")
  local italic = get_layout_value(span, "italic")
  local underline = get_layout_value(span, "underline")
  local small_caps = get_layout_value(span, "small-caps")
  local color = get_layout_value(span, "color")

  if not font_family and not font_size and not font_weight and not italic and not underline and not small_caps and not color then
    return nil
  end

  local style = get_attr(span, "style") or ""
  if font_family then
    style = append_css_rule(style, "font-family:" .. font_family .. ";")
  end
  if font_size then
    style = append_css_rule(style, "font-size:" .. font_size .. ";")
  end
  if font_weight then
    style = append_css_rule(style, "font-weight:" .. font_weight .. ";")
  end
  if italic == "true" then
    style = append_css_rule(style, "font-style:italic;")
  elseif italic == "false" then
    style = append_css_rule(style, "font-style:normal;")
  end
  if underline == "true" then
    style = append_css_rule(style, "text-decoration:underline;")
  elseif underline == "false" then
    style = append_css_rule(style, "text-decoration:none;")
  end
  if small_caps == "true" then
    style = append_css_rule(style, "font-variant-caps:small-caps;")
  elseif small_caps == "false" then
    style = append_css_rule(style, "font-variant-caps:normal;")
  end
  if color then
    style = append_css_rule(style, "color:" .. color .. ";")
  end
  if style ~= "" then
    span.attributes["style"] = style
  end
  return span
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

local function latex_font_size_command(font_size, line_spacing)
  if not font_size then
    return nil
  end

  local amount = tonumber((font_size:gsub("pt$", "")))
  if not amount then
    return nil
  end

  local baseline = amount * 1.2
  if line_spacing then
    local spacing = tonumber(line_spacing)
    if spacing and spacing > 0 then
      baseline = amount * spacing
    end
  end

  return "\\fontsize{" .. tostring(amount) .. "pt}{" .. tostring(baseline) .. "pt}\\selectfont"
end

local function apply_latex_layout(block)
  local spacer_lines = get_layout_value(block, "spacer-lines")
  local space_before = get_layout_value(block, "space-before")
  local space_after = get_layout_value(block, "space-after")
  local inset_left = get_layout_value(block, "inset-left")
  local inset_right = get_layout_value(block, "inset-right")
  local first_line_indent = get_layout_value(block, "first-line-indent")
  local align = get_layout_value(block, "align")
  local font_family = get_layout_value(block, "font-family")
  local font_size = get_layout_value(block, "font-size")
  local line_spacing = get_layout_value(block, "line-spacing")
  local font_weight = get_layout_value(block, "font-weight")
  local italic = get_layout_value(block, "italic")
  local underline = get_layout_value(block, "underline")
  local small_caps = get_layout_value(block, "small-caps")
  local color = get_layout_value(block, "color")
  local keep_together = get_layout_value(block, "keep-together")
  local page_break = get_layout_value(block, "page-break")

  if spacer_lines then
    local line_count = tonumber(spacer_lines)
    if not line_count or line_count <= 0 then
      return nil
    end

    local amount = font_size and tonumber((font_size:gsub("pt$", ""))) or nil
    local spacing = tonumber(line_spacing or "1.2")
    if amount and spacing and spacing > 0 then
      return pandoc.RawBlock("latex", "\\vspace*{" .. tostring(amount * spacing * line_count) .. "pt}")
    end
    return pandoc.RawBlock("latex", "\\vspace*{" .. tostring(line_count) .. "\\baselineskip}")
  end

  if not space_before and not space_after and not inset_left and not inset_right and not first_line_indent and not align and not font_family and not font_size and not line_spacing and not font_weight and not italic and not underline and not small_caps and not color and not keep_together and not page_break then
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
  if font_family then
    table.insert(wrapper, "\\fontspec{" .. font_family .. "}")
  end
  local font_size_command = latex_font_size_command(font_size, line_spacing)
  if font_size_command then
    table.insert(wrapper, font_size_command)
  end
  if line_spacing then
    table.insert(wrapper, "\\setstretch{" .. line_spacing .. "}")
  end
  if font_weight == "bold" then
    table.insert(wrapper, "\\bfseries")
  elseif font_weight == "normal" then
    table.insert(wrapper, "\\mdseries")
  end
  if italic == "true" then
    table.insert(wrapper, "\\itshape")
  end
  if small_caps == "true" then
    table.insert(wrapper, "\\scshape")
  end
  if color then
    table.insert(wrapper, "\\color[HTML]{" .. color:gsub("#", "") .. "}")
  end

  local needs_wrapper = #wrapper > 1
  if needs_wrapper then
    table.insert(blocks, pandoc.RawBlock("latex", table.concat(wrapper, "\n")))
  end

  if underline == "true" then
    table.insert(blocks, pandoc.RawBlock("latex", "\\ULon"))
  end

  table.insert(blocks, block)

  if underline == "true" then
    table.insert(blocks, pandoc.RawBlock("latex", "\\ULoff"))
  end

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

local function apply_latex_inline_styles(span)
  local font_family = get_layout_value(span, "font-family")
  local font_size = get_layout_value(span, "font-size")
  local font_weight = get_layout_value(span, "font-weight")
  local italic = get_layout_value(span, "italic")
  local underline = get_layout_value(span, "underline")
  local small_caps = get_layout_value(span, "small-caps")
  local color = get_layout_value(span, "color")

  if not font_family and not font_size and not font_weight and not italic and not underline and not small_caps and not color then
    return nil
  end

  local before = { "{" }
  if font_family then
    table.insert(before, "\\fontspec{" .. font_family:gsub("([\\{}])", "\\%1") .. "}")
  end
  local font_size_command = latex_font_size_command(font_size, nil)
  if font_size_command then
    table.insert(before, font_size_command)
  end
  if font_weight == "bold" then
    table.insert(before, "\\bfseries")
  elseif font_weight == "normal" then
    table.insert(before, "\\mdseries")
  end
  if italic == "true" then
    table.insert(before, "\\itshape")
  elseif italic == "false" then
    table.insert(before, "\\upshape")
  end
  if small_caps == "true" then
    table.insert(before, "\\scshape")
  elseif small_caps == "false" then
    table.insert(before, "\\normalfont")
  end
  if color then
    table.insert(before, "\\color[HTML]{" .. color:gsub("#", "") .. "}")
  end

  local result = { pandoc.RawInline("latex", table.concat(before, "")) }
  if underline == "true" then
    table.insert(result, pandoc.RawInline("latex", "\\uline{"))
  end
  for _, inline in ipairs(span.content) do
    table.insert(result, inline)
  end
  if underline == "true" then
    table.insert(result, pandoc.RawInline("latex", "}"))
  end
  table.insert(result, pandoc.RawInline("latex", "}"))
  return result
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

function Span(span)
  if FORMAT:match("latex") then
    return apply_latex_inline_styles(span)
  end
  if FORMAT:match("html") or FORMAT:match("epub") or FORMAT:match("revealjs") then
    return apply_html_inline_styles(span)
  end
  return nil
end
