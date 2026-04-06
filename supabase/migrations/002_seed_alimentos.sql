-- ============================================
-- Lucy App - Importación de 91 alimentos desde Airtable
-- ============================================
-- Mapeo de categorías Airtable → Supabase:
--   Proteina     → proteina
--   Carbohidrato → carbohidrato
--   Fibra        → vegetal
--   Grasa        → grasa
-- ============================================

INSERT INTO alimentos (nombre, categoria_comida, calorias_por_unidad, proteina_por_unidad, carbs_por_unidad, grasas_por_unidad, fibra_por_unidad, unidad_medida, porcion_base, porcion_min, porcion_max, rol_permitido, foto_url, categoria_supermercado) VALUES

-- === PROTEÍNAS (24) ===
('Pechuga de Pollo', 'proteina', 165, 31, 0, 3.6, 0, 'gramos', 150, 120, 200, ARRAY['Proteina'], 'https://images.pexels.com/photos/2338407/pexels-photo-2338407.jpeg?w=300', 'carnes'),
('Pollo', 'proteina', 165, 31, 0, 3.6, 0, 'gramos', 100, 80, 220, ARRAY['Proteina'], 'https://images.pexels.com/photos/5847876/pexels-photo-5847876.jpeg?w=300', 'carnes'),
('Muslos de Pollo', 'proteina', 209, 24, 0, 13, 0, 'gramos', 150, 120, 200, ARRAY['Proteina'], 'https://images.pexels.com/photos/1907227/pexels-photo-1907227.jpeg?w=300', 'carnes'),
('Caderas de Pollo', 'proteina', 209, 25, 0, 12, 0, 'gramos', 150, 120, 200, ARRAY['Proteina'], 'https://images.pexels.com/photos/7140316/pexels-photo-7140316.jpeg?w=300', 'carnes'),
('Huevo', 'proteina', 70, 6, 0.5, 5, 0, 'gramos', 50, 50, 200, ARRAY['Proteina','Grasa'], 'https://images.pexels.com/photos/162712/egg-white-food-protein-162712.jpeg?w=300', 'lacteos'),
('Salmon', 'proteina', 208, 25, 0, 13, 0, 'gramos', 100, 80, 200, ARRAY['Proteina'], 'https://images.pexels.com/photos/3296279/pexels-photo-3296279.jpeg?w=300', 'carnes'),
('Atun enlatado', 'proteina', 130, 29, 0, 1, 0, 'gramos', 100, 80, 180, ARRAY['Proteina'], 'https://images.pexels.com/photos/1640771/pexels-photo-1640771.jpeg?w=300', 'enlatados'),
('Atun Fresco', 'proteina', 144, 30, 0, 1.3, 0, 'gramos', 150, 120, 200, ARRAY['Proteina'], 'https://images.pexels.com/photos/3763847/pexels-photo-3763847.jpeg?w=300', 'carnes'),
('Carne molida', 'proteina', 250, 26, 0, 10, 0, 'gramos', 100, 80, 200, ARRAY['Proteina'], 'https://images.pexels.com/photos/1640772/pexels-photo-1640772.jpeg?w=300', 'carnes'),
('Carne Molida 97%', 'proteina', 152, 28, 0, 4.5, 0, 'gramos', 150, 120, 200, ARRAY['Proteina'], 'https://images.pexels.com/photos/128401/pexels-photo-128401.jpeg?w=300', 'carnes'),
('Pechuga de Pavo', 'proteina', 135, 29, 0, 1, 0, 'gramos', 100, 80, 200, ARRAY['Proteina'], 'https://images.pexels.com/photos/5949905/pexels-photo-5949905.jpeg?w=300', 'carnes'),
('Pavo Molido 97%', 'proteina', 148, 29, 0, 3.5, 0, 'gramos', 150, 120, 200, ARRAY['Proteina'], 'https://images.pexels.com/photos/6607314/pexels-photo-6607314.jpeg?w=300', 'carnes'),
('Filet Mignon', 'proteina', 271, 26, 0, 19, 0, 'gramos', 150, 120, 200, ARRAY['Proteina'], 'https://images.pexels.com/photos/3997609/pexels-photo-3997609.jpeg?w=300', 'carnes'),
('Beef Steak', 'proteina', 217, 26, 0, 12, 0, 'gramos', 150, 120, 200, ARRAY['Proteina'], 'https://images.pexels.com/photos/769289/pexels-photo-769289.jpeg?w=300', 'carnes'),
('Chuleta de Cerdo', 'proteina', 172, 26, 0, 7, 0, 'gramos', 150, 120, 200, ARRAY['Proteina'], 'https://images.pexels.com/photos/3535382/pexels-photo-3535382.jpeg?w=300', 'carnes'),
('Tenderloin de Cerdo', 'proteina', 143, 26, 0, 3.5, 0, 'gramos', 150, 120, 200, ARRAY['Proteina'], 'https://images.pexels.com/photos/1903936/pexels-photo-1903936.jpeg?w=300', 'carnes'),
('Cordero', 'proteina', 258, 25, 0, 17, 0, 'gramos', 150, 120, 180, ARRAY['Proteina'], 'https://images.pexels.com/photos/1660030/pexels-photo-1660030.jpeg?w=300', 'carnes'),
('Tilapia', 'proteina', 128, 26, 0, 2.7, 0, 'gramos', 150, 120, 200, ARRAY['Proteina'], 'https://images.pexels.com/photos/8352786/pexels-photo-8352786.jpeg?w=300', 'carnes'),
('Bacalao', 'proteina', 105, 23, 0, 0.9, 0, 'gramos', 150, 120, 200, ARRAY['Proteina'], 'https://images.pexels.com/photos/3296394/pexels-photo-3296394.jpeg?w=300', 'carnes'),
('Mahi Mahi', 'proteina', 109, 24, 0, 0.9, 0, 'gramos', 150, 120, 200, ARRAY['Proteina'], 'https://images.pexels.com/photos/2213257/pexels-photo-2213257.jpeg?w=300', 'carnes'),
('Halibut', 'proteina', 111, 23, 0, 2.3, 0, 'gramos', 150, 120, 200, ARRAY['Proteina'], 'https://images.pexels.com/photos/46239/salmon-dish-food-meal-46239.jpeg?w=300', 'carnes'),
('Camarones Jumbo', 'proteina', 99, 24, 0.9, 0.3, 0, 'gramos', 150, 120, 200, ARRAY['Proteina'], 'https://images.pexels.com/photos/566344/pexels-photo-566344.jpeg?w=300', 'carnes'),
('Tofu', 'proteina', 76, 8, 1.9, 4.8, 0.3, 'gramos', 150, 120, 200, ARRAY['Proteina'], 'https://images.pexels.com/photos/3766163/pexels-photo-3766163.jpeg?w=300', 'otro'),
('Tempeh', 'proteina', 193, 19, 9.4, 11, 0, 'gramos', 100, 80, 150, ARRAY['Proteina'], 'https://images.pexels.com/photos/7797854/pexels-photo-7797854.jpeg?w=300', 'otro'),

-- === PROTEÍNAS DESAYUNO (7) ===
('Yogur Griego', 'proteina', 59, 10, 3.6, 0.4, 0, 'gramos', 150, 120, 200, ARRAY['Proteina','Desayuno_1','Desayuno_2'], 'https://images.pexels.com/photos/1435706/pexels-photo-1435706.jpeg?w=300', 'lacteos'),
('Queso Cottage', 'proteina', 98, 11, 3.4, 4.3, 0, 'gramos', 100, 80, 150, ARRAY['Proteina','Desayuno_1','Desayuno_2'], 'https://images.pexels.com/photos/5949890/pexels-photo-5949890.jpeg?w=300', 'lacteos'),
('Tocineta', 'proteina', 541, 37, 1.4, 42, 0, 'gramos', 30, 20, 40, ARRAY['Proteina','Desayuno_1','Desayuno_2'], 'https://images.pexels.com/photos/1323550/pexels-photo-1323550.jpeg?w=300', 'carnes'),
('Tocineta de Pavo', 'proteina', 218, 28, 1, 11, 0, 'gramos', 30, 20, 45, ARRAY['Proteina','Desayuno_1','Desayuno_2'], 'https://images.pexels.com/photos/3994833/pexels-photo-3994833.jpeg?w=300', 'carnes'),
('Jamon', 'proteina', 145, 17, 1.5, 8, 0, 'gramos', 50, 40, 80, ARRAY['Proteina','Desayuno_1','Desayuno_2'], 'https://images.pexels.com/photos/3993062/pexels-photo-3993062.jpeg?w=300', 'carnes'),
('Jamon de Pavo', 'proteina', 100, 15, 2, 3.5, 0, 'gramos', 50, 40, 80, ARRAY['Proteina','Desayuno_1','Desayuno_2'], 'https://images.pexels.com/photos/357576/pexels-photo-357576.jpeg?w=300', 'carnes'),
('Avena con Proteina en Polvo', 'carbohidrato', 180, 18, 27, 3.5, 4, 'gramos', 100, 80, 120, ARRAY['Carbohidrato','Desayuno_1','Desayuno_2'], 'https://images.pexels.com/photos/3764959/pexels-photo-3764959.jpeg?w=300', 'granos_cereales'),

-- === CARBOHIDRATOS (21) ===
('Arroz', 'carbohidrato', 130, 2.5, 28, 0.3, 0.5, 'gramos', 100, 50, 250, ARRAY['Carbohidrato'], 'https://images.pexels.com/photos/4110251/pexels-photo-4110251.jpeg?w=300', 'granos_cereales'),
('Avena', 'carbohidrato', 150, 5, 27, 3, 4, 'gramos', 40, 30, 100, ARRAY['Carbohidrato'], 'https://images.pexels.com/photos/704569/pexels-photo-704569.jpeg?w=300', 'granos_cereales'),
('Papa', 'carbohidrato', 77, 2, 17, 0.1, 2.2, 'gramos', 100, 100, 300, ARRAY['Carbohidrato'], 'https://images.pexels.com/photos/144248/potatoes-vegetables-erdfrucht-bio-144248.jpeg?w=300', 'frutas_verduras'),
('Batata', 'carbohidrato', 86, 1.6, 20, 0.1, 3, 'gramos', 100, 100, 300, ARRAY['Carbohidrato'], 'https://images.pexels.com/photos/89247/pexels-photo-89247.jpeg?w=300', 'frutas_verduras'),
('Yuca', 'carbohidrato', 160, 1.4, 38, 0.3, 1.8, 'gramos', 100, 80, 250, ARRAY['Carbohidrato'], 'https://images.pexels.com/photos/4113867/pexels-photo-4113867.jpeg?w=300', 'frutas_verduras'),
('Habichuelas', 'carbohidrato', 140, 9, 25, 0.5, 8, 'gramos', 100, 50, 180, ARRAY['Fibra','Carbohidrato'], 'https://images.pexels.com/photos/1640774/pexels-photo-1640774.jpeg?w=300', 'enlatados'),
('Lentejas', 'carbohidrato', 116, 9, 20, 0.4, 7.9, 'gramos', 100, 80, 150, ARRAY['Carbohidrato','Fibra'], 'https://images.pexels.com/photos/15107600/pexels-photo-15107600.jpeg?w=300', 'granos_cereales'),
('Garbanzos', 'carbohidrato', 164, 8.9, 27, 2.6, 7.6, 'gramos', 100, 80, 150, ARRAY['Carbohidrato','Fibra'], 'https://images.pexels.com/photos/3872355/pexels-photo-3872355.jpeg?w=300', 'enlatados'),
('Quinoa', 'carbohidrato', 120, 4.4, 21, 1.9, 2.8, 'gramos', 100, 80, 150, ARRAY['Carbohidrato'], 'https://images.pexels.com/photos/1640773/pexels-photo-1640773.jpeg?w=300', 'granos_cereales'),
('Tortillas de Maiz', 'carbohidrato', 218, 5.7, 46, 2.5, 4.2, 'gramos', 60, 45, 90, ARRAY['Carbohidrato','Desayuno_1','Desayuno_2'], 'https://images.pexels.com/photos/7613562/pexels-photo-7613562.jpeg?w=300', 'panaderia'),
('Pan', 'carbohidrato', 80, 3, 15, 1, 1.5, 'gramos', 30, 30, 90, ARRAY['Carbohidrato'], 'https://images.pexels.com/photos/1775043/pexels-photo-1775043.jpeg?w=300', 'panaderia'),
('Pasta', 'carbohidrato', 131, 5, 25, 1.1, 1.8, 'gramos', 80, 60, 100, ARRAY['Carbohidrato'], 'https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg?w=300', 'granos_cereales'),
('Platano', 'carbohidrato', 122, 1.3, 32, 0.4, 2.3, 'gramos', 100, 80, 150, ARRAY['Carbohidrato'], 'https://images.pexels.com/photos/8105060/pexels-photo-8105060.jpeg?w=300', 'frutas_verduras'),
('Malanga', 'carbohidrato', 95, 1.5, 22, 0.2, 4, 'gramos', 100, 80, 150, ARRAY['Carbohidrato'], 'https://images.pexels.com/photos/8065842/pexels-photo-8065842.jpeg?w=300', 'frutas_verduras'),
('Name', 'carbohidrato', 118, 1.5, 28, 0.2, 4.1, 'gramos', 100, 80, 150, ARRAY['Carbohidrato'], 'https://images.pexels.com/photos/3985082/pexels-photo-3985082.jpeg?w=300', 'frutas_verduras'),
('Mazorca (Elote)', 'carbohidrato', 86, 3.2, 19, 1.2, 2.7, 'gramos', 100, 80, 150, ARRAY['Carbohidrato'], 'https://images.pexels.com/photos/1459341/pexels-photo-1459341.jpeg?w=300', 'frutas_verduras'),
('Setas (Hongos)', 'carbohidrato', 22, 3.1, 3.3, 0.3, 1, 'gramos', 100, 80, 150, ARRAY['Carbohidrato','Fibra'], 'https://images.pexels.com/photos/1437587/pexels-photo-1437587.jpeg?w=300', 'frutas_verduras'),
('Leche', 'carbohidrato', 42, 3.4, 5, 1, 0, 'ml', 240, 200, 300, ARRAY['Carbohidrato','Desayuno_1','Desayuno_2'], 'https://images.pexels.com/photos/236010/pexels-photo-236010.jpeg?w=300', 'lacteos'),

-- === FRUTAS (8) ===
('Guineo (Banano)', 'carbohidrato', 89, 1.1, 23, 0.3, 2.6, 'gramos', 100, 80, 150, ARRAY['Carbohidrato','Desayuno_1','Desayuno_2'], 'https://images.pexels.com/photos/1166648/pexels-photo-1166648.jpeg?w=300', 'frutas_verduras'),
('Manzana', 'carbohidrato', 52, 0.3, 14, 0.2, 2.4, 'gramos', 100, 100, 180, ARRAY['Carbohidrato','Desayuno_1','Desayuno_2'], 'https://images.pexels.com/photos/102104/pexels-photo-102104.jpeg?w=300', 'frutas_verduras'),
('Berries (Mix)', 'carbohidrato', 57, 0.7, 14, 0.3, 2.4, 'gramos', 100, 80, 150, ARRAY['Carbohidrato','Desayuno_1','Desayuno_2'], 'https://images.pexels.com/photos/1132047/pexels-photo-1132047.jpeg?w=300', 'frutas_verduras'),
('Piña', 'carbohidrato', 50, 0.5, 13, 0.1, 1.4, 'gramos', 100, 100, 200, ARRAY['Carbohidrato','Desayuno_1','Desayuno_2'], 'https://images.pexels.com/photos/947879/pexels-photo-947879.jpeg?w=300', 'frutas_verduras'),
('Mango', 'carbohidrato', 60, 0.8, 15, 0.4, 1.6, 'gramos', 100, 100, 200, ARRAY['Carbohidrato','Desayuno_1','Desayuno_2'], 'https://images.pexels.com/photos/918643/pexels-photo-918643.jpeg?w=300', 'frutas_verduras'),
('Kiwi', 'carbohidrato', 61, 1.1, 15, 0.5, 3, 'gramos', 100, 80, 150, ARRAY['Carbohidrato','Desayuno_1','Desayuno_2'], 'https://images.pexels.com/photos/1161547/pexels-photo-1161547.jpeg?w=300', 'frutas_verduras'),
('Uvas', 'carbohidrato', 69, 0.7, 18, 0.2, 0.9, 'gramos', 100, 80, 150, ARRAY['Carbohidrato','Desayuno_1','Desayuno_2'], 'https://images.pexels.com/photos/1353546/pexels-photo-1353546.jpeg?w=300', 'frutas_verduras'),
('Pera', 'carbohidrato', 57, 0.4, 15, 0.1, 3.1, 'gramos', 100, 100, 180, ARRAY['Carbohidrato','Desayuno_1','Desayuno_2'], 'https://images.pexels.com/photos/568471/pexels-photo-568471.jpeg?w=300', 'frutas_verduras'),

-- === VEGETALES / FIBRA (18) ===
('Brocoli', 'vegetal', 35, 2.8, 7, 0.4, 2.6, 'gramos', 100, 50, 200, ARRAY['Fibra'], 'https://images.pexels.com/photos/1367240/pexels-photo-1367240.jpeg?w=300', 'frutas_verduras'),
('Espinaca', 'vegetal', 23, 2.9, 3.6, 0.4, 2.2, 'gramos', 100, 30, 150, ARRAY['Fibra'], 'https://images.pexels.com/photos/2255935/pexels-photo-2255935.jpeg?w=300', 'frutas_verduras'),
('Zanahoria', 'vegetal', 41, 0.9, 10, 0.2, 2.8, 'gramos', 100, 50, 150, ARRAY['Fibra'], 'https://images.pexels.com/photos/143133/pexels-photo-143133.jpeg?w=300', 'frutas_verduras'),
('Ensalada (lechuga+tomate)', 'vegetal', 25, 1, 5, 0.2, 1.5, 'gramos', 100, 50, 200, ARRAY['Fibra'], 'https://images.pexels.com/photos/1640775/pexels-photo-1640775.jpeg?w=300', 'frutas_verduras'),
('Kale', 'vegetal', 49, 4.3, 8.8, 0.9, 3.6, 'gramos', 80, 60, 150, ARRAY['Fibra'], 'https://images.pexels.com/photos/1400172/pexels-photo-1400172.jpeg?w=300', 'frutas_verduras'),
('Arugula', 'vegetal', 25, 2.6, 3.7, 0.7, 1.6, 'gramos', 80, 60, 150, ARRAY['Fibra'], 'https://images.pexels.com/photos/4110252/pexels-photo-4110252.jpeg?w=300', 'frutas_verduras'),
('Apio', 'vegetal', 16, 0.7, 3, 0.2, 1.6, 'gramos', 100, 80, 200, ARRAY['Fibra'], 'https://images.pexels.com/photos/965878/pexels-photo-965878.jpeg?w=300', 'frutas_verduras'),
('Repollo', 'vegetal', 25, 1.3, 5.8, 0.1, 2.5, 'gramos', 100, 80, 200, ARRAY['Fibra'], 'https://images.pexels.com/photos/2100960/pexels-photo-2100960.jpeg?w=300', 'frutas_verduras'),
('Tomates', 'vegetal', 18, 0.9, 3.9, 0.2, 1.2, 'gramos', 100, 80, 200, ARRAY['Fibra'], 'https://images.pexels.com/photos/533280/pexels-photo-533280.jpeg?w=300', 'frutas_verduras'),
('Pimientos', 'vegetal', 31, 1, 6, 0.3, 2.1, 'gramos', 100, 80, 200, ARRAY['Fibra'], 'https://images.pexels.com/photos/1435900/pexels-photo-1435900.jpeg?w=300', 'frutas_verduras'),
('Pepino', 'vegetal', 16, 0.7, 3.6, 0.1, 0.5, 'gramos', 100, 80, 200, ARRAY['Fibra'], 'https://images.pexels.com/photos/2329440/pexels-photo-2329440.jpeg?w=300', 'frutas_verduras'),
('Cebolla', 'vegetal', 40, 1.1, 9.3, 0.1, 1.7, 'gramos', 50, 30, 80, ARRAY['Fibra'], 'https://images.pexels.com/photos/2255939/pexels-photo-2255939.jpeg?w=300', 'frutas_verduras'),
('Habichuelas Verdes', 'vegetal', 31, 1.8, 7, 0.2, 2.7, 'gramos', 100, 80, 200, ARRAY['Fibra'], 'https://images.pexels.com/photos/2893635/pexels-photo-2893635.jpeg?w=300', 'frutas_verduras'),
('Esparragos', 'vegetal', 20, 2.2, 3.9, 0.1, 2.1, 'gramos', 100, 80, 200, ARRAY['Fibra'], 'https://images.pexels.com/photos/1307658/pexels-photo-1307658.jpeg?w=300', 'frutas_verduras'),
('Berenjena', 'vegetal', 25, 1, 5.7, 0.2, 3, 'gramos', 100, 80, 200, ARRAY['Fibra'], 'https://images.pexels.com/photos/5639/eggplant-salad-healthy-food.jpg?w=300', 'frutas_verduras'),
('Calabacin', 'vegetal', 17, 1.2, 3.1, 0.3, 1, 'gramos', 100, 80, 200, ARRAY['Fibra'], 'https://images.pexels.com/photos/1439474/pexels-photo-1439474.jpeg?w=300', 'frutas_verduras'),
('Coliflor', 'vegetal', 25, 1.9, 5, 0.3, 2, 'gramos', 100, 80, 200, ARRAY['Fibra'], 'https://images.pexels.com/photos/5529991/pexels-photo-5529991.jpeg?w=300', 'frutas_verduras'),
('Brussel Sprouts', 'vegetal', 43, 3.4, 9, 0.3, 3.8, 'gramos', 100, 80, 200, ARRAY['Fibra'], 'https://images.pexels.com/photos/1618897/pexels-photo-1618897.jpeg?w=300', 'frutas_verduras'),

-- === GRASAS (17) ===
('Aguacate', 'grasa', 160, 2, 9, 15, 7, 'gramos', 100, 30, 100, ARRAY['Grasa'], 'https://images.pexels.com/photos/557659/pexels-photo-557659.jpeg?w=300', 'frutas_verduras'),
('Aceite de oliva', 'grasa', 90, 0, 0, 10, 0, 'gramos', 10, 5, 20, ARRAY['Grasa'], 'https://images.pexels.com/photos/33783/olive-oil-salad-dressing-cooking.jpg?w=300', 'condimentos'),
('Crema de mani', 'grasa', 188, 8, 6, 16, 2, 'gramos', 32, 10, 40, ARRAY['Grasa'], 'https://images.pexels.com/photos/4187622/pexels-photo-4187622.jpeg?w=300', 'condimentos'),
('Almendras', 'grasa', 164, 6, 6, 14, 3.5, 'gramos', 28, 15, 50, ARRAY['Grasa'], 'https://images.pexels.com/photos/1295572/pexels-photo-1295572.jpeg?w=300', 'otro'),
('Mantequilla', 'grasa', 72, 0, 0, 8, 0, 'gramos', 10, 5, 20, ARRAY['Grasa'], 'https://images.pexels.com/photos/531334/pexels-photo-531334.jpeg?w=300', 'lacteos'),
('Nueces', 'grasa', 654, 15, 14, 65, 6.7, 'gramos', 28, 20, 40, ARRAY['Grasa'], 'https://images.pexels.com/photos/89243/pexels-photo-89243.jpeg?w=300', 'otro'),
('Cashews', 'grasa', 553, 18, 30, 44, 3.3, 'gramos', 28, 20, 40, ARRAY['Grasa'], 'https://images.pexels.com/photos/4663476/pexels-photo-4663476.jpeg?w=300', 'otro'),
('Avellanas', 'grasa', 628, 15, 17, 61, 9.7, 'gramos', 28, 20, 40, ARRAY['Grasa'], 'https://images.pexels.com/photos/2338874/pexels-photo-2338874.jpeg?w=300', 'otro'),
('Crema de Almendra', 'grasa', 614, 21, 19, 56, 10, 'gramos', 32, 20, 40, ARRAY['Grasa'], 'https://images.pexels.com/photos/5149342/pexels-photo-5149342.jpeg?w=300', 'condimentos'),
('Queso Mozzarella', 'grasa', 280, 22, 2.2, 22, 0, 'gramos', 30, 20, 40, ARRAY['Grasa'], 'https://images.pexels.com/photos/4194139/pexels-photo-4194139.jpeg?w=300', 'lacteos'),
('Queso Parmesano', 'grasa', 431, 38, 4.1, 29, 0, 'gramos', 20, 15, 30, ARRAY['Grasa'], 'https://images.pexels.com/photos/4193821/pexels-photo-4193821.jpeg?w=300', 'lacteos'),
('Queso Suizo', 'grasa', 380, 27, 5.4, 28, 0, 'gramos', 30, 20, 40, ARRAY['Grasa','Desayuno_1','Desayuno_2'], 'https://images.pexels.com/photos/821365/pexels-photo-821365.jpeg?w=300', 'lacteos'),
('Queso Gouda', 'grasa', 356, 25, 2.2, 28, 0, 'gramos', 30, 20, 40, ARRAY['Grasa','Desayuno_1','Desayuno_2'], 'https://images.pexels.com/photos/4187781/pexels-photo-4187781.jpeg?w=300', 'lacteos'),
('Aceite de Aguacate', 'grasa', 884, 0, 0, 100, 0, 'ml', 15, 10, 20, ARRAY['Grasa'], 'https://images.pexels.com/photos/2284350/pexels-photo-2284350.jpeg?w=300', 'condimentos'),
('Aceite de Coco', 'grasa', 862, 0, 0, 100, 0, 'ml', 15, 10, 20, ARRAY['Grasa'], 'https://images.pexels.com/photos/725998/pexels-photo-725998.jpeg?w=300', 'condimentos'),
('Ghee', 'grasa', 900, 0, 0, 100, 0, 'ml', 10, 8, 15, ARRAY['Grasa'], 'https://images.pexels.com/photos/4110003/pexels-photo-4110003.jpeg?w=300', 'condimentos');
