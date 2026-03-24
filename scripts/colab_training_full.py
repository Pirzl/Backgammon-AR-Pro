import pandas as pd
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers
import os

# 1. Carga de Datos
# IMPORTANTE: Sube tus archivos game_history_ai_training.csv y zobrist_evaluations.csv a Colab
# Usa el icono de la carpeta a la izquierda para subirlos.
history_file = 'game_history_ai_training.csv'
evals_file = 'zobrist_evaluations.csv'

if not os.path.exists(history_file):
    print(f"ERROR: No se encuentra {history_file}. Súbelo a la carpeta de archivos de Colab.")
else:
    df_hist = pd.read_csv(history_file)
    df_eval = pd.read_csv(evals_file)
    
    # 2. Pre-procesamiento (Codificación del Tablero Real 198-vector)
    # Transformamos el tablero en un vector que la IA entiende perfectamente:
    # 24 puntos * 4 (para representar número de piezas) + Bar + Home + Turno
    def encode_board(board_array):
        """
        Codifica un tablero de Backgammon (24 puntos + bar/off) en un vector de 198.
        Estructura:
        - Para cada punto (1-24): 4 neuronas (1 pieza, 2 piezas, 3 piezas, n>3 piezas)
        - Bar (2 neuronas: blanca/negra)
        - Home (2 neuronas: blanca/negra)
        """
        feature_vector = np.zeros(198)
        
        # Codificación de los 24 puntos
        for i in range(1, 25):
            val = board_array[i]
            idx = (i - 1) * 8
            if val > 0: # White
                if val >= 1: feature_vector[idx] = 1
                if val >= 2: feature_vector[idx+1] = 1
                if val >= 3: feature_vector[idx+2] = 1
                if val > 3:  feature_vector[idx+3] = (val - 3) / 2.0
            elif val < 0: # Black
                val = abs(val)
                if val >= 1: feature_vector[idx+4] = 1
                if val >= 2: feature_vector[idx+5] = 1
                if val >= 3: feature_vector[idx+6] = 1
                if val > 3:  feature_vector[idx+7] = (val - 3) / 2.0
        
        # Bar y Off (Índices aproximados según constantes del proyecto)
        feature_vector[192] = abs(board_array[26]) / 15.0 # White Bar
        feature_vector[193] = abs(board_array[27]) / 15.0 # Black Bar
        feature_vector[194] = abs(board_array[28]) / 15.0 # White Off
        feature_vector[195] = abs(board_array[29]) / 15.0 # Black Off
        
        return feature_vector

    print("Preparando datos con codificación REAL de Backgammon...")
    # Convertimos los tableros JSON del CSV a vectores reales
    import json
    X = []
    for board_str in df_eval['board_state']:
        board_array = json.loads(board_str)
        X.append(encode_board(board_array))
    
    X = np.array(X)
    y = df_eval['equity'].values 

    # 3. Construcción del Modelo "Pro"
    model = tf.keras.Sequential([
        layers.Input(shape=(198,)),
        layers.Dense(512, activation='relu'),
        layers.BatchNormalization(),
        layers.Dropout(0.3),
        layers.Dense(256, activation='relu'),
        layers.Dense(128, activation='relu'),
        layers.Dense(1, activation='tanh') # Salida entre -1 y 1 (probabilidad de victoria)
    ])

    model.compile(optimizer='adam', loss='mse', metrics=['mae'])

    # 4. Entrenamiento
    print("Iniciando entrenamiento del cerebro de la IA...")
    model.fit(X, y, epochs=50, batch_size=64, validation_split=0.2)

    # 5. Exportar para la Web
    model.save('backgammon_model.h5')
    print("¡Modelo guardado como 'backgammon_model.h5'! Úsalo en el Web Worker de la app.")
