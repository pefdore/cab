#!/usr/bin/env python3
# Démo Option B : PDF "Honoraires médicaux" calqué sur le modèle Google Doc.
# Pagination stricte : page 1 = Médecine/SSR, page 2 = EHPAD, page 3+ = Liste des patients.
import os
import matplotlib
from fpdf import FPDF

BASE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(BASE, "logo.jpg")
FONT_DIR = os.path.join(os.path.dirname(matplotlib.__file__), "mpl-data", "fonts", "ttf")

TARIFS = {
    "G": 30.00, "VG": 40.00, "VGMU": 52.60, "ALQP003": 69.12,
    "VL": 60.00, "VLMD": 70.00, "VGMDMSH": 63.00, "VGMDIK": 41.22, "MPA": 5.00,
}

UNITS = ["zéro","un","deux","trois","quatre","cinq","six","sept","huit","neuf","dix","onze",
         "douze","treize","quatorze","quinze","seize","dix-sept","dix-huit","dix-neuf"]
TENS = {2:"vingt",3:"trente",4:"quarante",5:"cinquante",6:"soixante",7:"soixante",8:"quatre-vingt",9:"quatre-vingt"}

def sous_cent(n):
    if n == 0: return ""
    if n < 20: return UNITS[n]
    t, u = divmod(n, 10)
    if t == 8: return "quatre-vingt" + ("s" if u == 0 else "-" + UNITS[u])
    if t in (7, 9):
        base = TENS[t]
        if u == 0: return base
        return base + "-" + UNITS[10 + u]
    base = TENS[t]
    if u == 0: return base
    if u == 1 and t != 8: return base + "-et-un"
    return base + "-" + UNITS[u]

def trois_chiffres(n):
    s = ""
    c, rest = divmod(n, 100)
    if c:
        s += UNITS[c] + " cent" + ("s" if c > 1 and rest == 0 else "")
    if rest: s += (" " if s else "") + sous_cent(rest)
    return s

def en_lettres(montant):
    total = int(round(montant * 100))
    euros, cents = divmod(total, 100)
    partie = []
    milliers, reste = divmod(euros, 1000)
    if milliers:
        partie.append((trois_chiffres(milliers) if milliers > 1 else "") .strip() + " mille")
    if reste: partie.append(trois_chiffres(reste))
    texte = " ".join(partie).strip() or "zéro"
    texte += " euros"
    if cents: texte += f" et {sous_cent(cents)} centimes"
    return texte

def fmt(x):
    return f"{x:,.2f}".replace(",", " ").replace(".", ",")

MOIS = "janvier 2026"
DATE = "31 janvier 2026"

MEDECINE = {"G": 12, "VG": 25, "MPA": 8}
EHPAD = {
    "Availles":  {"G": 6, "VG": 14, "VGMU": 3, "ALQP003": 2, "VL": 5, "VLMD": 4, "VGMDMSH": 1, "VGMDIK": 2},
    "Lilas Rdc": {"G": 4, "VG": 11, "VGMU": 2, "ALQP003": 1, "VL": 3, "VLMD": 2, "VGMDMSH": 0, "VGMDIK": 1},
    "Lilas 1er": {"G": 5, "VG": 9,  "VGMU": 4, "ALQP003": 0, "VL": 2, "VLMD": 3, "VGMDMSH": 1, "VGMDIK": 0},
    "Tamaris":   {"G": 7, "VG": 16, "VGMU": 1, "ALQP003": 3, "VL": 6, "VLMD": 1, "VGMDMSH": 2, "VGMDIK": 1},
}
ACTES_EHPAD = [
    ("G", "G"), ("VG", "VG+MD"), ("VGMU", "VG+MU ou V+MU"),
    ("ALQP003", "ALQP003 (ou ALQP006)"), ("VL", "VL"), ("VLMD", "VL+MD"),
    ("VGMDMSH", "VG+MD+MSH"), ("VGMDIK", "VG+MD+2IK"),
]

class PDF(FPDF):
    def header(self):
        pass
    def footer(self):
        pass

pdf = PDF(orientation="P", unit="mm", format="A4")
pdf.set_margins(18, 12, 18)
pdf.set_auto_page_break(False)
pdf.add_font("DejaVu", "", os.path.join(FONT_DIR, "DejaVuSans.ttf"))
pdf.add_font("DejaVu", "B", os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf"))
pdf.add_font("DejaVu", "I", os.path.join(FONT_DIR, "DejaVuSans-Oblique.ttf"))

def entete(refs, avec_retenue):
    """Logo à gauche, bloc texte à droite (comme le modèle)."""
    y0 = 12
    if os.path.exists(LOGO):
        pdf.image(LOGO, x=18, y=y0, h=20)
    pdf.set_xy(42, y0 + 1)
    pdf.set_font("DejaVu", "B", 12)
    pdf.multi_cell(0, 6, "CENTRE HOSPITALIER SAINT JEAN\n63, Faubourg de Rennes, 35130 LA GUERCHE DE BRETAGNE", align="L")
    pdf.set_y(y0 + 26)
    pdf.set_font("DejaVu", "B", 13)
    pdf.cell(0, 8, "HONORAIRES MEDICAUX", align="C")
    pdf.ln(7)
    pdf.set_font("DejaVu", "B", 12)
    pdf.cell(0, 7, "EN SERVICES DE MEDECINE - SSR", align="C")
    pdf.ln(9)
    pdf.set_font("DejaVu", "B", 9)
    pdf.write(5, "REFERENCES : ")
    pdf.set_font("DejaVu", "", 9)
    pdf.write(5, refs)
    pdf.ln(9)
    if avec_retenue:
        pdf.set_font("DejaVu", "", 9)
        pdf.multi_cell(0, 4.5,
            "Les honoraires sont fixés à 100% de la valeur de l'acte conventionné.\n"
            "Sur ces honoraires est due à l'établissement une redevance de 10% pour\n"
            "participation aux frais de structure, de personnel et d'équipements hospitaliers de l'établissement.")
        pdf.ln(3)
    pdf.set_font("DejaVu", "B", 9)
    pdf.write(5, "DESIGNATION : ")
    pdf.set_font("DejaVu", "", 9)
    pdf.write(5, "Docteur DORE Pierre-François, Médecin généraliste, autorisé à exercer dans l'établissement.\n")
    pdf.write(5, "CCM BETTON IBAN FR7615589351100287012394050")
    pdf.ln(7)

def memoire(montant, y):
    pdf.set_xy(18, y)
    pdf.set_font("DejaVu", "", 10)
    pdf.write(6, "Arrêt le présent mémoire à la somme de : ")
    pdf.set_font("DejaVu", "B", 10)
    pdf.write(6, f"{en_lettres(montant)} €".capitalize())
    pdf.set_xy(18, y + 18)
    pdf.set_font("DejaVu", "", 10)
    pdf.write(6, f"La Guerche de Bretagne, le {DATE}")
    pdf.set_xy(18, y + 40)
    pdf.set_font("DejaVu", "B", 11)
    pdf.cell(0, 6, "Docteur DORE", align="R")

# ============================ PAGE 1 : MEDECINE / SSR ============================
pdf.add_page()
entete("Application de la loi 2021-502 du 26 avril 2021 (notamment l'article 19) - Application des articles L 6146-2 et L 6146-41 du Code de la santé publique", True)

pdf.set_font("DejaVu", "B", 10)
pdf.write(6, "ETAT DES SOMMES DUES POUR LE MOIS DE : ")
pdf.set_font("DejaVu", "U", 10)
pdf.write(6, MOIS.upper())
pdf.ln(9)

col = [28, 58, 30, 58]
pdf.set_font("DejaVu", "B", 10)
pdf.set_fill_color(230, 230, 230)
for h, w in zip(["Nombre", "Actes", "Prix", "Montant"], col):
    pdf.cell(w, 8, h, border=1, align="C", fill=True)
pdf.ln()
pdf.set_font("DejaVu", "", 10)
labels = {"G": "G", "VG": "VG", "MPA": "MPA"}
for acte, n in MEDECINE.items():
    pdf.cell(col[0], 8, str(n), border=1, align="C")
    pdf.cell(col[1], 8, labels[acte], border=1, align="C")
    pdf.cell(col[2], 8, fmt(TARIFS[acte]) + " €", border=1, align="C")
    pdf.cell(col[3], 8, fmt(n * TARIFS[acte]) + " €", border=1, align="C")
    pdf.ln()

total = sum(n * TARIFS[a] for a, n in MEDECINE.items())
retenue = total * 0.10
averser = total - retenue
pdf.ln(6)
pdf.set_font("DejaVu", "B", 11)
pdf.cell(116, 8, "Montant total", align="R")
pdf.cell(58, 8, fmt(total) + " €", align="R", border="T")
pdf.ln(8)
pdf.cell(116, 8, "Retenue 10%", align="R")
pdf.cell(58, 8, fmt(retenue) + " €", align="R")
pdf.ln(8)
pdf.cell(116, 8, "Montant à verser", align="R")
pdf.cell(58, 8, fmt(averser) + " €", align="R", border="TB")
memoire(averser, 232)

# ============================ PAGE 2 : EHPAD (1 page stricte) ============================
pdf.add_page()
entete("contrat pluriannuel d'Objectif et de Moyens signés le 29 juin 2020 - Articles L 313-11, L 313-12, L313-12-2 du Code de l'Action Sociale et des Familles", False)

pdf.set_font("DejaVu", "B", 10)
pdf.write(6, "ETAT DES SOMMES DUES POUR LE MOIS DE : ")
pdf.set_font("DejaVu", "U", 10)
pdf.write(6, MOIS.upper())
pdf.ln(8)

W = [26, 18, 46, 22, 32, 34]
pdf.set_font("DejaVu", "B", 8)
pdf.set_fill_color(230, 230, 230)
for h, w in zip(["Services", "Nombre", "Actes", "Prix", "Montant par actes", "Total par service"], W):
    pdf.cell(w, 6.5, h, border=1, align="C", fill=True)
pdf.ln()

total_ehpad = 0
RH = 5.2
for service, actes in EHPAD.items():
    total_service = sum(n * TARIFS[a] for a, n in actes.items())
    total_ehpad += total_service
    premier = True
    for key, libelle in ACTES_EHPAD:
        n = actes.get(key, 0)
        pdf.set_font("DejaVu", "", 7.5)
        pdf.cell(W[0], RH, service if premier else "", border=1, align="C")
        premier = False
        pdf.cell(W[1], RH, str(n), border=1, align="C")
        pdf.cell(W[2], RH, libelle, border=1, align="C")
        pdf.cell(W[3], RH, fmt(TARIFS[key]) + " €", border=1, align="C")
        pdf.cell(W[4], RH, fmt(n * TARIFS[key]) + " €", border=1, align="C")
        pdf.cell(W[5], RH, fmt(total_service) + " €" if key == ACTES_EHPAD[0][0] else "", border=1, align="C")
        pdf.ln(RH)

pdf.ln(4)
pdf.set_font("DejaVu", "B", 11)
pdf.cell(136, 8, "MONTANT TOTAL :", align="R")
pdf.cell(50, 8, fmt(total_ehpad) + " €", align="R")
y_after_table = pdf.get_y()  # position juste sous MONTANT TOTAL
y_memoire = y_after_table + 14
memoire(total_ehpad, y_memoire)

# ============================ PAGE 3+ : LISTE DES PATIENTS ============================
pdf.add_page()
if os.path.exists(LOGO):
    pdf.image(LOGO, x=18, y=12, h=20)
pdf.set_xy(42, 13)
pdf.set_font("DejaVu", "B", 12)
pdf.multi_cell(0, 6, "CENTRE HOSPITALIER SAINT JEAN\n63, Faubourg de Rennes, 35130 LA GUERCHE DE BRETAGNE", align="L")
pdf.set_y(40)
pdf.set_font("DejaVu", "B", 13)
pdf.cell(0, 7, "LISTE DES PATIENTS VUS", align="C")
pdf.ln(9)
pdf.set_font("DejaVu", "B", 10)
pdf.write(6, "Mois de : ")
pdf.set_font("DejaVu", "U", 10)
pdf.write(6, MOIS.upper())
pdf.ln(8)

import random
random.seed(42)
noms = ["BERTRAND Margot", "LE GALL Hervé", "MARTIN Solène", "DUVAL Jacques", "QUERRIEN Yves",
        "GAUTIER Nicole", "PERRIN Camille", "LE ROUX Bernard", "THOMAS Janine", "COIC Monique",
        "RIO Monique", "GENDRY Alain", "BRIANT Louise", "CHARPIN Gilbert", "MERCIER Raymonde",
        "OGÉ Sylvie", "PAITARD Denise", "ROBIN Ernest", "SIMON Odette", "VAUGRENARD Yvonne"]
lieux = ["SSR", "Médecine", "Availles", "Lilas Rdc", "Lilas 1er", "Tamaris"]
cotations = ["G", "VG", "MPA", "VG+MD", "VL", "VL+MD", "VG+MU", "ALQP003"]
patients = sorted(
    [(f"2026-01-{d:02d}", random.choice(noms), random.choice(lieux), random.choice(cotations))
     for d in range(2, 29)],
    key=lambda t: t[0],
)

WP = [24, 34, 62, 30, 32]

def entete_tableau_patients():
    pdf.set_font("DejaVu", "B", 9)
    pdf.set_fill_color(230, 230, 230)
    for h, w in zip(["Date", "Médecin", "Nom patient", "Lieu", "Cotation"], WP):
        pdf.cell(w, 7, h, border=1, align="C", fill=True)
    pdf.ln()
    pdf.set_font("DejaVu", "", 8)

entete_tableau_patients()
rows_per_page = int((280 - pdf.get_y()) // 6.5)
count = 0
for date, nom, lieu, cot in patients:
    if count and count % rows_per_page == 0:
        pdf.add_page()
        pdf.set_y(18)
        entete_tableau_patients()
    pdf.cell(WP[0], 6.5, date, border=1, align="C")
    pdf.cell(WP[1], 6.5, "Dr DORE", border=1, align="C")
    pdf.cell(WP[2], 6.5, nom, border=1)
    pdf.cell(WP[3], 6.5, lieu, border=1, align="C")
    pdf.cell(WP[4], 6.5, cot, border=1, align="C")
    pdf.ln()
    count += 1

out = os.path.join(BASE, "honoraires_demo.pdf")
pdf.output(out)
print("PDF généré :", out)
print(f"Page 1 : total {fmt(total)} €, retenue {fmt(retenue)} €, à verser {fmt(averser)} €")
print(f"Page 2 : total EHPAD {fmt(total_ehpad)} €")
print(f"Pages patients : {len(patients)} lignes")
