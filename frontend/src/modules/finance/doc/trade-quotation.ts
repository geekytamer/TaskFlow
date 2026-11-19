import type { InvoiceTemplate } from '../types';
import type { Block, InvoiceDoc } from './types';

/**
 * A single-commodity trade quotation (quotes only), after the owner's sample
 * sheet (2026-11-19): company and logo, QUOTATION with an Arabic subtitle,
 * label/value rows, numbered section bars, buyer and product details,
 * payment terms, documents list, terms, issued-by with signature and stamp.
 * Labels are written in both languages as blocks shown only in their own
 * language (lang:en / lang:ar), so no shared label translation changes.
 * Per-quote values come from fill-in fields ({{field.destination}}…),
 * the first priced line ({{line1.*}}) and the quote's data tokens.
 */
const BODY: Block[] = [
  {
    "id": "trade-c-1",
    "type": "container",
    "layout": "row",
    "gap": 16,
    "style": {
      "border": {
        "width": 2,
        "color": "#111111",
        "style": "solid",
        "sides": [
          "bottom"
        ]
      },
      "padding": {
        "bottom": 14
      }
    },
    "children": [
      {
        "id": "trade-c-2",
        "type": "container",
        "layout": "stack",
        "gap": 2,
        "style": {
          "width": "70%"
        },
        "children": [
          {
            "id": "trade-t-3",
            "type": "text",
            "content": "{{company.name}}",
            "style": {
              "color": "#374151"
            }
          },
          {
            "id": "trade-t-4",
            "type": "text",
            "content": "{{company.address}}",
            "style": {
              "color": "#374151"
            }
          }
        ]
      },
      {
        "id": "trade-img-5",
        "type": "image",
        "binding": "logo",
        "height": 60,
        "fit": "contain",
        "style": {
          "width": "30%",
          "align": "right"
        }
      }
    ]
  },
  {
    "id": "trade-h-6",
    "type": "heading",
    "level": 1,
    "content": "QUOTATION",
    "style": {
      "align": "center",
      "margin": {
        "top": 16
      },
      "fontSize": 26
    }
  },
  {
    "id": "trade-t-7",
    "type": "text",
    "content": "عرض سعر رسمي",
    "style": {
      "align": "center",
      "color": "#6b7280",
      "margin": {
        "bottom": 18
      }
    },
    "visibleWhen": "lang:en"
  },
  {
    "id": "trade-d-8",
    "type": "details",
    "layout": "rows",
    "visibleWhen": "lang:en",
    "style": {
      "padding": {
        "left": 0,
        "right": 0
      },
      "fontSize": 12
    },
    "fields": [
      {
        "label": "Quotation No.",
        "value": "{{doc.number}}"
      },
      {
        "label": "Date",
        "value": "{{doc.date}}"
      },
      {
        "label": "Validity",
        "value": "{{fields.validity}}"
      }
    ]
  },
  {
    "id": "trade-d-9",
    "type": "details",
    "layout": "rows",
    "visibleWhen": "lang:ar",
    "style": {
      "padding": {
        "left": 0,
        "right": 0
      },
      "fontSize": 12
    },
    "fields": [
      {
        "label": "رقم العرض",
        "value": "{{doc.number}}"
      },
      {
        "label": "التاريخ",
        "value": "{{doc.date}}"
      },
      {
        "label": "مدة الصلاحية",
        "value": "{{fields.validity}}"
      }
    ]
  },
  {
    "id": "trade-t-10",
    "type": "text",
    "content": "1. Buyer information",
    "style": {
      "background": "#f2f2f2",
      "padding": {
        "top": 6,
        "bottom": 6,
        "left": 12,
        "right": 12
      },
      "fontWeight": 600,
      "fontSize": 13,
      "margin": {
        "top": 10,
        "bottom": 0
      }
    },
    "visibleWhen": "lang:en"
  },
  {
    "id": "trade-t-11",
    "type": "text",
    "content": "١. بيانات المشتري",
    "style": {
      "background": "#f2f2f2",
      "padding": {
        "top": 6,
        "bottom": 6,
        "left": 12,
        "right": 12
      },
      "fontWeight": 600,
      "fontSize": 13,
      "margin": {
        "top": 10,
        "bottom": 0
      }
    },
    "visibleWhen": "lang:ar"
  },
  {
    "id": "trade-d-12",
    "type": "details",
    "layout": "rows",
    "visibleWhen": "lang:en",
    "style": {
      "padding": {
        "left": 12,
        "right": 12
      },
      "fontSize": 12
    },
    "fields": [
      {
        "label": "Buyer company",
        "value": "{{to.name}}"
      },
      {
        "label": "Contact person",
        "value": "{{contact.name}}"
      },
      {
        "label": "Destination",
        "value": "{{field.destination}}"
      }
    ]
  },
  {
    "id": "trade-d-13",
    "type": "details",
    "layout": "rows",
    "visibleWhen": "lang:ar",
    "style": {
      "padding": {
        "left": 12,
        "right": 12
      },
      "fontSize": 12
    },
    "fields": [
      {
        "label": "الشركة المشترية",
        "value": "{{to.name}}"
      },
      {
        "label": "الشخص المسؤول",
        "value": "{{contact.name}}"
      },
      {
        "label": "الوجهة",
        "value": "{{field.destination}}"
      }
    ]
  },
  {
    "id": "trade-t-14",
    "type": "text",
    "content": "2. Product and commercial details",
    "style": {
      "background": "#f2f2f2",
      "padding": {
        "top": 6,
        "bottom": 6,
        "left": 12,
        "right": 12
      },
      "fontWeight": 600,
      "fontSize": 13,
      "margin": {
        "top": 10,
        "bottom": 0
      }
    },
    "visibleWhen": "lang:en"
  },
  {
    "id": "trade-t-15",
    "type": "text",
    "content": "٢. تفاصيل المنتج والشروط التجارية",
    "style": {
      "background": "#f2f2f2",
      "padding": {
        "top": 6,
        "bottom": 6,
        "left": 12,
        "right": 12
      },
      "fontWeight": 600,
      "fontSize": 13,
      "margin": {
        "top": 10,
        "bottom": 0
      }
    },
    "visibleWhen": "lang:ar"
  },
  {
    "id": "trade-d-16",
    "type": "details",
    "layout": "rows",
    "visibleWhen": "lang:en",
    "style": {
      "padding": {
        "left": 12,
        "right": 12
      },
      "fontSize": 12
    },
    "fields": [
      {
        "label": "Commodity",
        "value": "{{line1.description}}"
      },
      {
        "label": "Origin",
        "value": "{{field.origin}}"
      },
      {
        "label": "Quantity",
        "value": "{{line1.quantity}} {{line1.unit}}"
      },
      {
        "label": "Price per unit",
        "value": "{{line1.unitPrice}} / {{line1.unit}}"
      },
      {
        "label": "Total value",
        "value": "{{line1.amount}}"
      },
      {
        "label": "Delivery terms",
        "value": "{{field.delivery_terms}}"
      },
      {
        "label": "Packaging",
        "value": "{{field.packaging}}"
      },
      {
        "label": "Inspection",
        "value": "{{field.inspection}}"
      },
      {
        "label": "Certificate of origin",
        "value": "{{field.certificate_of_origin}}"
      }
    ]
  },
  {
    "id": "trade-d-17",
    "type": "details",
    "layout": "rows",
    "visibleWhen": "lang:ar",
    "style": {
      "padding": {
        "left": 12,
        "right": 12
      },
      "fontSize": 12
    },
    "fields": [
      {
        "label": "السلعة",
        "value": "{{line1.description}}"
      },
      {
        "label": "المنشأ",
        "value": "{{field.origin}}"
      },
      {
        "label": "الكمية",
        "value": "{{line1.quantity}} {{line1.unit}}"
      },
      {
        "label": "سعر الوحدة",
        "value": "{{line1.unitPrice}} / {{line1.unit}}"
      },
      {
        "label": "المبلغ الإجمالي",
        "value": "{{line1.amount}}"
      },
      {
        "label": "شروط التسليم",
        "value": "{{field.delivery_terms}}"
      },
      {
        "label": "التعبئة",
        "value": "{{field.packaging}}"
      },
      {
        "label": "الفحص",
        "value": "{{field.inspection}}"
      },
      {
        "label": "شهادة المنشأ",
        "value": "{{field.certificate_of_origin}}"
      }
    ]
  },
  {
    "id": "trade-t-18",
    "type": "text",
    "content": "3. Payment terms",
    "style": {
      "background": "#f2f2f2",
      "padding": {
        "top": 6,
        "bottom": 6,
        "left": 12,
        "right": 12
      },
      "fontWeight": 600,
      "fontSize": 13,
      "margin": {
        "top": 10,
        "bottom": 0
      }
    },
    "visibleWhen": "lang:en"
  },
  {
    "id": "trade-t-19",
    "type": "text",
    "content": "٣. شروط الدفع",
    "style": {
      "background": "#f2f2f2",
      "padding": {
        "top": 6,
        "bottom": 6,
        "left": 12,
        "right": 12
      },
      "fontWeight": 600,
      "fontSize": 13,
      "margin": {
        "top": 10,
        "bottom": 0
      }
    },
    "visibleWhen": "lang:ar"
  },
  {
    "id": "trade-s-20",
    "type": "slot",
    "slot": "terms",
    "fallback": "Irrevocable Documentary Letter of Credit (DLC), subject to agreed contractual terms.",
    "style": {
      "padding": {
        "left": 12,
        "right": 12
      },
      "lineHeight": 1.5,
      "fontSize": 12,
      "margin": {
        "top": 6
      }
    }
  },
  {
    "id": "trade-t-21",
    "type": "text",
    "content": "4. Documents to be provided",
    "style": {
      "background": "#f2f2f2",
      "padding": {
        "top": 6,
        "bottom": 6,
        "left": 12,
        "right": 12
      },
      "fontWeight": 600,
      "fontSize": 13,
      "margin": {
        "top": 10,
        "bottom": 0
      }
    },
    "visibleWhen": "lang:en"
  },
  {
    "id": "trade-t-22",
    "type": "text",
    "content": "٤. المستندات المطلوبة",
    "style": {
      "background": "#f2f2f2",
      "padding": {
        "top": 6,
        "bottom": 6,
        "left": 12,
        "right": 12
      },
      "fontWeight": 600,
      "fontSize": 13,
      "margin": {
        "top": 10,
        "bottom": 0
      }
    },
    "visibleWhen": "lang:ar"
  },
  {
    "id": "trade-s-23",
    "type": "slot",
    "slot": "scope",
    "fallback": "1. Commercial invoice\n2. Packing list\n3. Certificate of origin\n4. SGS / Intertek certificate\n5. Bill of lading",
    "style": {
      "padding": {
        "left": 12,
        "right": 12
      },
      "lineHeight": 1.5,
      "fontSize": 12,
      "margin": {
        "top": 6
      }
    }
  },
  {
    "id": "trade-t-24",
    "type": "text",
    "content": "5. Terms and conditions",
    "style": {
      "background": "#f2f2f2",
      "padding": {
        "top": 6,
        "bottom": 6,
        "left": 12,
        "right": 12
      },
      "fontWeight": 600,
      "fontSize": 13,
      "margin": {
        "top": 10,
        "bottom": 0
      }
    },
    "visibleWhen": "lang:en"
  },
  {
    "id": "trade-t-25",
    "type": "text",
    "content": "٥. الشروط والأحكام",
    "style": {
      "background": "#f2f2f2",
      "padding": {
        "top": 6,
        "bottom": 6,
        "left": 12,
        "right": 12
      },
      "fontWeight": 600,
      "fontSize": 13,
      "margin": {
        "top": 10,
        "bottom": 0
      }
    },
    "visibleWhen": "lang:ar"
  },
  {
    "id": "trade-s-26",
    "type": "slot",
    "slot": "closing",
    "fallback": "Subject to final confirmation, mutual agreement, and execution of the Sales and Purchase Agreement (SPA).",
    "style": {
      "padding": {
        "left": 12,
        "right": 12
      },
      "lineHeight": 1.5,
      "fontSize": 12,
      "margin": {
        "top": 6
      }
    }
  },
  {
    "id": "trade-c-40",
    "type": "container",
    "layout": "grid",
    "columns": 3,
    "gap": 24,
    "style": {
      "margin": {
        "top": 16
      },
      "padding": {
        "top": 12
      },
      "border": {
        "width": 1,
        "color": "#e5e7eb",
        "style": "solid",
        "sides": [
          "top"
        ]
      }
    },
    "children": [
      {
        "id": "trade-c-27",
        "type": "container",
        "layout": "stack",
        "gap": 2,
        "visibleWhen": "lang:en",
        "style": {},
        "children": [
          {
            "id": "trade-t-28",
            "type": "text",
            "content": "Issued by",
            "style": {
              "color": "#6b7280"
            }
          },
          {
            "id": "trade-t-29",
            "type": "text",
            "content": "{{owner.name}}",
            "style": {
              "fontWeight": 600
            }
          },
          {
            "id": "trade-t-30",
            "type": "text",
            "content": "{{owner.title}}",
            "style": {}
          },
          {
            "id": "trade-t-31",
            "type": "text",
            "content": "Authorized signature",
            "style": {
              "color": "#6b7280",
              "margin": {
                "top": 18
              },
              "border": {
                "width": 1,
                "color": "#9ca3af",
                "style": "solid",
                "sides": [
                  "top"
                ]
              },
              "padding": {
                "top": 6
              }
            }
          }
        ]
      },
      {
        "id": "trade-c-32",
        "type": "container",
        "layout": "stack",
        "gap": 2,
        "visibleWhen": "lang:ar",
        "style": {},
        "children": [
          {
            "id": "trade-t-33",
            "type": "text",
            "content": "صادر عن",
            "style": {
              "color": "#6b7280"
            }
          },
          {
            "id": "trade-t-34",
            "type": "text",
            "content": "{{owner.name}}",
            "style": {
              "fontWeight": 600
            }
          },
          {
            "id": "trade-t-35",
            "type": "text",
            "content": "{{owner.title}}",
            "style": {}
          },
          {
            "id": "trade-t-36",
            "type": "text",
            "content": "التوقيع المعتمد",
            "style": {
              "color": "#6b7280",
              "margin": {
                "top": 18
              },
              "border": {
                "width": 1,
                "color": "#9ca3af",
                "style": "solid",
                "sides": [
                  "top"
                ]
              },
              "padding": {
                "top": 6
              }
            }
          }
        ]
      },
      {
        "id": "trade-sp-41",
        "type": "spacer",
        "height": 1
      },
      {
        "id": "trade-c-37",
        "type": "container",
        "layout": "stack",
        "style": {
          "width": "110px",
          "margin": {
            "left": 60
          },
          "border": {
            "width": 1,
            "color": "#c7c7c7",
            "style": "dashed"
          },
          "borderRadius": 500,
          "padding": {
            "top": 34,
            "bottom": 34
          },
          "align": "center",
          "color": "#9ca3af"
        },
        "children": [
          {
            "id": "trade-t-38",
            "type": "text",
            "content": "Company stamp",
            "style": {
              "align": "center",
              "color": "#9ca3af"
            },
            "visibleWhen": "lang:en"
          },
          {
            "id": "trade-t-39",
            "type": "text",
            "content": "ختم الشركة",
            "style": {
              "align": "center",
              "color": "#9ca3af"
            },
            "visibleWhen": "lang:ar"
          }
        ]
      }
    ]
  }
] as Block[];

// The template is accepted like the other starters; this layout carries its own look.
export function tradeQuotationDoc(_template?: InvoiceTemplate): InvoiceDoc {
  return {
    version: 1,
    page: { size: 'A4', orientation: 'portrait', margin: { top: 12, right: 14, bottom: 10, left: 14 } },
    theme: { fontFamily: 'Inter', primaryColor: '#111111', accentColor: '#111111', textColor: '#111111' },
    // A fresh copy every time, so editing one template never touches another.
    body: JSON.parse(JSON.stringify(BODY)) as Block[],
  };
}
