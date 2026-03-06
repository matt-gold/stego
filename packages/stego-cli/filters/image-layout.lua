local function get_image_attr(img, key)
  if not img or not img.attributes then
    return nil
  end
  local value = img.attributes[key]
  if value == nil or value == "" then
    return nil
  end
  return value
end

local function get_layout(img)
  local layout = get_image_attr(img, "layout") or get_image_attr(img, "data-layout")
  if layout == "block" or layout == "inline" then
    return layout
  end
  return nil
end

local function get_align(img)
  local align = get_image_attr(img, "align") or get_image_attr(img, "data-align")
  if align == "left" or align == "center" or align == "right" then
    return align
  end
  return nil
end

local function extract_single_image(block)
  if not block or not (block.t == "Para" or block.t == "Plain") then
    return nil
  end
  if #block.content ~= 1 then
    return nil
  end
  local img = block.content[1]
  if not img or img.t ~= "Image" then
    return nil
  end
  return img
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

local function apply_html_layout_alignment(img)
  local layout = get_layout(img)
  local align = get_align(img)
  if not layout and not align then
    return img
  end

  local style = get_image_attr(img, "style") or ""

  if layout == "block" then
    style = append_css_rule(style, "display:block;")
  elseif layout == "inline" then
    style = append_css_rule(style, "display:inline;")
  end

  if layout ~= "inline" then
    if align == "left" then
      style = append_css_rule(style, "margin-left:0; margin-right:auto;")
    elseif align == "right" then
      style = append_css_rule(style, "margin-left:auto; margin-right:0;")
    elseif align == "center" then
      style = append_css_rule(style, "margin-left:auto; margin-right:auto;")
    end
  end

  if style ~= "" then
    img.attributes["style"] = style
  end

  return img
end

local function wrap_latex_image_alignment(block, align)
  if not align then
    return block
  end

  local code = nil
  if align == "left" then
    code = "l"
  elseif align == "center" then
    code = "c"
  elseif align == "right" then
    code = "r"
  end
  if not code then
    return block
  end

  table.insert(block.content, 1, pandoc.RawInline("latex", "\\makebox[\\linewidth][" .. code .. "]{"))
  table.insert(block.content, pandoc.RawInline("latex", "}"))
  return block
end

function Image(img)
  if FORMAT:match("html") or FORMAT:match("epub") or FORMAT:match("revealjs") then
    return apply_html_layout_alignment(img)
  end
  return img
end

function Figure(fig)
  if not FORMAT:match("latex") then
    return nil
  end

  if #fig.content ~= 1 then
    return nil
  end

  local block = fig.content[1]
  local img = extract_single_image(block)
  if not img then
    return nil
  end

  local layout = get_layout(img)
  local align = get_align(img)
  if not layout and not align then
    return nil
  end

  if layout == "inline" then
    return pandoc.Para({ img })
  end

  fig.content[1] = wrap_latex_image_alignment(block, align)
  return fig
end

function Para(para)
  if not FORMAT:match("latex") then
    return nil
  end

  local img = extract_single_image(para)
  if not img then
    return nil
  end

  local layout = get_layout(img)
  local align = get_align(img)
  if layout == "inline" then
    return nil
  end

  if align then
    return wrap_latex_image_alignment(para, align)
  end
  return nil
end
