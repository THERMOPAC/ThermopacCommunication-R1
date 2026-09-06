URL: https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/
Fetched evidence continuation at startIndex=50000:

ormal boiling temperature, which can be estimated using the critical volume () by the Tyn-Calus relation \[ [31](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B31-materials-14-00542), [37](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B37-materials-14-00542)\]:

|     |     |
| --- | --- |
|  | (2) |

The Tyn-Calus equation \[ [7](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B7-materials-14-00542)\] is another commonly used hydrodynamic equation, which is described by:

|     |     |
| --- | --- |
|  | (3) |

Magalhães et al. \[ [9](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B9-materials-14-00542)\] proposed nine correlations for , and four of them depend explicitly on solvent viscosity and temperature. Here we adopt the following:

|     |     |
| --- | --- |
|  | (4) |

where  and  are fitted parameters for each system. This equation consists of a modification of the Stokes–Einstein theory \[ [31](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B31-materials-14-00542)\].

Zhu et al. \[ [13](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B13-materials-14-00542)\] developed a hybrid model containing a component related with the free volume and another related with energy. It was devised for the estimation of  of real nonpolar fluids. It is described by:

|     |     |
| --- | --- |
|  | (5) |

where the subscripts 1 and 2 denominate solvent and solute, respectively,  is the mass of the solvent, and  and  are the density and temperature reduced using binary Lennard-Jones (LJ) parameters  and  as described by:

|     |     |
| --- | --- |
|  | (6) |

|     |     |
| --- | --- |
|  | (7) |

The binary LJ parameters are calculated by the following combining rules:

|     |     |
| --- | --- |
|  | (8) |

and the interaction parameter  is estimated through:

|     |     |
| --- | --- |
|  | (9) |

Finally, the LJ parameters  and  for the solute are calculated by:

|     |     |
| --- | --- |
|  | (10) |

and for the solvent:

|     |     |
| --- | --- |
|  | (11) |

|     |     |
| --- | --- |
|  | (12) |

where  is the number critical density (cm−3) and  and  are the reduced density and reduced temperature of the solvent, calculated with the corresponding critical constants:  and .

## 3\. Results and Discussion

### 3.1. Machine Learning Models

The first step towards model development was the choice of relevant variables for the model. Selection was conducted on the basis of the collinearities between the available variables/properties and their level of correlation with the diffusivity. [Figure 1](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#materials-14-00542-f001) and [Figure 2](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#materials-14-00542-f002) show the correlation matrix (in the form of a heat map) for the polar and nonpolar data sets, where the values represent the absolute Pearson correlation. When two variables presented collinearities above a defined threshold of 0.50, only one was kept in the model, namely the one providing of the best correlation with diffusivity. Following this procedure, six variables were selected for the polar diffusivity model: temperature, solvent viscosity, solute molar mass, solute critical pressure, solvent molar mass, and the Lennard-Jones energy constant of solvent. For the nonpolar diffusivity model, temperature, solvent viscosity, solute molar mass, solute critical pressure, and solvent molar mass were chosen, totaling five variables. A summary of the variables required for the machine learning models for polar (ML Polar) and nonpolar (ML Nonpolar) systems is presented in [Table 3](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#materials-14-00542-t003), together with the required inputs for the classic models of Wilke-Chang, Tyn-Calus, Magalhães et al., and Zhu et al. The two hydrodynamic equations require four input variables, the same number as the Magalhães et al. correlation although, in this later case, two of the four parameters must be fitted to experimental data, thus reducing the model applicability. The Zhu et al. hybrid model requires the larger number of parameters (seven) and is only applicable to nonpolar systems.

#### Figure 1.

[![Figure 1](https://cdn.ncbi.nlm.nih.gov/pmc/blobs/146a/7866074/65f7136dcb6a/materials-14-00542-g001.jpg)](https://www.ncbi.nlm.nih.gov/core/lw/2.0/html/tileshop_pmc/tileshop_pmc_inline.html?title=Click%20on%20image%20to%20zoom&p=PMC3&id=7866074_materials-14-00542-g001.jpg)

[Open in a new tab](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/figure/materials-14-00542-f001/)

Correlation heat map for all properties and variables in the database of polar compounds. Colormap shows the absolute value of the Pearson correlation from zero (light green) to one (dark blue).

#### Figure 2.

[![Figure 2](https://cdn.ncbi.nlm.nih.gov/pmc/blobs/146a/7866074/250bf4661abe/materials-14-00542-g002.jpg)](https://www.ncbi.nlm.nih.gov/core/lw/2.0/html/tileshop_pmc/tileshop_pmc_inline.html?title=Click%20on%20image%20to%20zoom&p=PMC3&id=7866074_materials-14-00542-g002.jpg)

[Open in a new tab](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/figure/materials-14-00542-f002/)

Correlation heat map for all properties and variables in the database of nonpolar compounds. Colormap shows the absolute value of the Pearson correlation from zero (light green) to one (dark blue).

#### Table 3.

Required inputs for the new and classic diffusivity models.

| Parameters | Proposed Models | Classic Models |
| :-: | :-: | :-: |
| ML Polar | ML Nonpolar | Wilke-Chang (Equation (1)) | Tyn-Calus (Equation (3)) | Magalhães et al. \[ [9](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B9-materials-14-00542)\] (Equation (4)) | Zhu et al. <br>\[ [13](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B13-materials-14-00542)\] (Equations (5)–(10)) |
| :-: | :-: | :-: | :-: | :-: | :-: |
|  | ● | ● | ● | ● | ● | ● |
|  |  |  |  |  |  | ● |
|  | ● | ● | ● | ● | ● |  |
|  | ● | ● |  |  |  |  |
|  |  |  |  |  |  | ● |
|  |  |  |  |  |  |  |
|  | ● | ● |  |  |  | ● |
|  |  |  | ● | ● |  |  |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |
|  | ● | ● | ● |  |  | ● |
|  |  |  |  |  |  | ● |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |
|  |  |  |  | ● |  | ● |
|  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |
|  | ● |  |  |  |  |  |
| Fitted | - | - | - | - | 2 | - |
| Count | 6 | 5 | 4 | 4 | 4 | 7 |

[Open in a new tab](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/table/materials-14-00542-t003/)

Note: The ● indicates the parameters required in each model.

The performance of all models was evaluated by calculating the average absolute relative deviation (AARD) of each system:

|     |     |
| --- | --- |
|  | (13) |

where superscripts calc and exp denote calculated and experimental values, and NDP is the number of data points of a system. For the whole database, the global deviation (i.e., weighted AARD) and the arithmetic systems average (AARDarith) were calculated. The minimum and maximum system AARD are reported as an indication of the performance of the best and worst systems. The root mean square error (RMSE) was also calculated and is defined as:

|     |     |
| --- | --- |
|  | (14) |

The coefficient of determination, _R_ 2, which is calculated for the training set, and the _Q_ 2 value, which corresponds to _R_ 2 value obtained when applying the model to the test set, are also reported for all models.

A final validation of the best machine learning models was conducted by performing a y-randomization test (also called y-scrambling). This test compares the performance of the original model with that of models built for a scrambled (randomly shuffled) response while still following the original model building procedure. The randomization process eliminates the relation between the independent variables and target response. If the performance of the models when using scrambled data is much lower than when using original data, one can be confident of the relevance of the original model. Five algorithms were tested to develop the supervised learning models including a multilinear regression, _k_-nearest neighbors, decision tree, random forest (an averaging ensemble method), and gradient boosted (a boosting ensemble method). The performance of the several machine learning algorithms when applied to the test set of polar data, covering 79 systems and 430 points, is shown in [Table 4](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#materials-14-00542-t004). The gradient boosted algorithm presents the best performance for the test set (pure prediction) with an AARD of 5.07% followed by the random forest, decision tree, _k_-nearest neighbors, and multilinear regression (from lower to higher AARD). Similar trends are present when analyzing the arithmetic average of 79 systems AARD, as well as the minimum and the maximum AARD. As expected, the multilinear regression exhibits much worse results than the other four algorithms for all the AARD metrics. The gradient boosted algorithm also presents the lowest RMSE and highest _Q_ 2. The _Q_ 2 value is also close to _R_ 2 indicating that the model works well independently of its training data. [Figure 3](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#materials-14-00542-f003) plots the diffusivities predicted by the gradient boosted ML model against the respective experimental values for the test set of polar systems, showing a very good distribution along the diagonal. Similar representations are provided for the remaining four algorithms in [Figures S1–S4 of the Supplementary Material](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#app1-materials-14-00542). The multilinear regression model presents significant underestimation at higher values of  and overestimation in the intermediate region. On the other hand, the remaining three algorithms show good dispersion around the diagonal, however with larger deviations than the gradient boosted model.

#### Table 4.

Performance of several machine learning (ML)models for the prediction of diffusivities in polar systems (test set) and comparison with classic predictive and correlation models.

| Model | NSys | NDP | Global AARD (%) | AARDarith<br>(%) | AARDmin<br>(%) | AARDmax<br>(%) | RMSE | _Q_ 2 ( _R_ 2)<br>\\*\\*\\* |
| :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| ML Polar Multilinear Regression | 79 | 430 | 84.65 | 80.65 | 4.00 | 899.66 | 3.33 × 10−5 | 0.7215 (0.7504) |
| ML Polar _k_-Nearest Neighbors | 79 | 430 | 8.94 | 17.55 | 0.22 | 317.43 | 1.20 × 10−5 | 0.9641 (1.0000) |
| ML Polar Decision Tree | 79 | 430 | 7.14 | 12.68 | 0.22 | 229.69 | 7.83 × 10−6 | 0.9846 (1.0000) |
| ML Polar Random Forest | 79 | 430 | 5.67 | 9.44 | 0.04 | 82.92 | 6.67 × 10−6 | 0.9889 (1.0000) |
| ML Polar Gradient Boosted | 79 | 430 | 5.07 | 8.00 | 0.08 | 76.23 | 5.68 × 10−6 | 0.9919 (0.9998) |
| Wilke-Chang | 79 | 430 | 40.92 | 41.35 | 1.37 | 197.71 | 3.15 × 10−5 | 0.7519 (0.6790) |
| Tyn-Calus | 79 | 430 | 46.49 | 38.41 | 2.88 | 97.11 | 2.30 × 10−5 | 0.8672 (0.8399) |
| Magalhães et al. | 76 \* | 419 | 5.19 | 6.23 | 0.15 | 92.77 | 5.81 × 10−6 | 0.9917 (0.9977) |
| Zhu et al. | \*\* | \*\* | \*\* | \*\* | \*\* | \*\* | \*\* | \*\* |

[Open in a new tab](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/table/materials-14-00542-t004/)

\\* Magalhães et al. correlation cannot be applied in three systems of the database due to the low number of points. \*\* Model of Zhu et al. is not applicable to polar systems. NSys: number of systems; NDP: number of data points; Global AARD: weighted deviation of all systems; AARDarith: arithmetic average of all systems; AARDmin: minimum AARD; and AARDmax: maximum AARD. \*\*\* _Q_ 2 ( _R_ 2): _R_ 2 is the coefficient of determination for training and _Q_ 2 is the corresponding value for testing, in the case of ML models. For the Wilke-Chang, Tyn-Calus and Zhu et al. models all values are predicted.

#### Figure 3.

[![Figure 3](https://cdn.ncbi.nlm.nih.gov/pmc/blobs/146a/7866074/b8017a0a8552/materials-14-00542-g003.jpg)](https://www.ncbi.nlm.nih.gov/core/lw/2.0/html/tileshop_pmc/tileshop_pmc_inline.html?title=Click%20on%20image%20to%20zoom&p=PMC3&id=7866074_materials-14-00542-g003.jpg)

[Open in a new tab](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/figure/materials-14-00542-f003/)

Predicted _versus_ experimental diffusivities for the test set of polar systems for the best machine learning model (Gradient Boosted): ( **a**) plot including all calculated results; ( **b**) plot zooming on lower  range.

[Table 5](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#materials-14-00542-t005) presents the results obtained using each ML algorithm for the test set of nonpolar compounds (130 systems and 342 points). Once again, the gradient boosted algorithm presents the best global AARD for the 130 systems of the test set (5.86%), followed by the random forest, then by the decision tree and _k_-nearest neighbors with similar results, and lastly by the multilinear regression with significantly worst results. A similar trend is visible when calculating a simple arithmetic average of systems AARD. The gradient boosted algorithm shows the lowest RMSE and highest _Q_ 2. The calculated _versus_ experimental diffusivities for the test set of nonpolar compounds using the Gradient Boosted model are plotted in [Figure 4](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#materials-14-00542-f004), showing unbiased distribution along the diagonal over all range of experimental points. [Figures S5–S8 of the Supplementary Material](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#app1-materials-14-00542) provide the calculated against experimental plots for the remaining four algorithms. As in the case of the polar data, the multilinear regression model once again presents significant deviations. The _k_-nearest neighbors, decision tree, and random forest algorithms provide better scattering around the diagonal. Few outliers may be observed, particularly in the case of the decision tree model.

#### Table 5.

Performance of several machine learning (ML) models for the prediction of diffusivities in nonpolar systems (test set) and comparison with classic predictive and correlation models.

| Model | NSys | NDP | Global AARD (%) | AARDarith(%) | AARDmin(%) | AARDmax(%) | RMSE | _Q_ 2 ( _R_ 2) \*\* |
| :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| ML Nonpolar Multilinear Regression | 130 | 342 | 96.65 | 111.95 | 0.91 | 1731.52 | 8.37 × 10−5 | 0.5590 (0.5779) |
| ML Nonpolar _k_-Nearest Neighbors | 130 | 342 | 13.64 | 13.86 | 0.00 | 63.05 | 2.93 × 10−5 | 0.9461 (0.9998) |
| ML Nonpolar Decision Tree | 130 | 342 | 13.29 | 14.08 | 0.00 | 90.96 | 5.08 × 10−5 | 0.8380 (0.9998) |
| ML Nonpolar Random Forest | 130 | 342 | 9.94 | 10.29 | 0.00 | 62.04 | 1.83 × 10−5 | 0.9789 (0.9998) |
| ML Nonpolar Gradient Boosted | 130 | 342 | 5.86 | 6.02 | 0.03 | 25.87 | 1.39 × 10−5 | 0.9879 (0.9866) |
| Wilke-Chang | 130 | 342 | 29.19 | 28.20 | 0.26 | 172.30 | 6.66 × 10−5 | 0.7214 (0.5546) |
| Tyn-Calus | 130 | 342 | 28.84 | 27.82 | 0.18 | 64.97 | 7.01 × 10−5 | 0.6909 (0.7465) |
| Magalhães et al. | 125 \* | 324 | 6.19 | 6.21 | 0.04 | 128.38 | 1.82 × 10−5 | 0.9801 (0.9890) |
| Zhu et al. | 130 | 342 | 37.93 | 45.19 | 1.40 | 222.45 | 6.35 × 10−5 | 0.7466 (0.8343) |

[Open in a new tab](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/table/materials-14-00542-t005/)

\\* Magalhães et al. correlation cannot be applied in five systems of the database due to the low number of points. NSys: number of systems; NDP: number of data points; Global AARD: weighted deviation of all systems; AARDarith: arithmetic average of all systems; AARDmin: minimum AARD; and AARDmax: maximum AARD. \*\* _Q_ 2 ( _R_ 2): _R_ 2 is the coefficient of determination for training and _Q_ 2 is the corresponding value for testing, in the case of ML models. For the Wilke-Chang, Tyn-Calus and Zhu et al. models all values are predicted.

#### Figure 4.

[![Figure 4](https://cdn.ncbi.nlm.nih.gov/pmc/blobs/146a/7866074/2ee0516f8c8e/materials-14-00542-g004.jpg)](https://www.ncbi.nlm.nih.gov/core/lw/2.0/html/tileshop_pmc/tileshop_pmc_inline.html?title=Click%20on%20image%20to%20zoom&p=PMC3&id=7866074_materials-14-00542-g004.jpg)

[Open in a new tab](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/figure/materials-14-00542-f004/)

Predicted _versus_ experimental diffusivities for the test set of nonpolar systems for the best machine learning model (Gradient Boosted) showing ( **a**) plot including all calculated results; ( **b**) plot zooming on lower  range.

As a final validation of the gradient boosted models selected for polar and nonpolar systems, a y-randomization test was performed by scrambling the diffusivity vector. This process was repeated 200 times and always returned random models with performances much lower than the original ones, thus confirming the significance of the proposed models. [Figure S9 of the Supplementary Material](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#app1-materials-14-00542) shows the contrast between the _Q_ 2 values of our models (0.9919 for polar and 0.9879 for nonpolar) and the lower ones obtained for the permutations. It is worth noting that: (i) the best possible score of _Q_ 2 (and _R_ 2) is 1.0; (ii) for a constant model that always predicts the expected value of the response, both indicators are zero; (iii) _Q_ 2 (and _R_ 2) can be negative for arbitrarily worse model.

Summarily, the ML Polar Gradient Boosted model showed good performance for the prediction of diffusivities of multiple solutes in polar solvents in the following train and test domain:  = 268–554 K;  = 0.0241–17.6 cP;  = 17–674 g mol−1;  = 4.1–221.2 bar;  = 20–113 g mol−1; and  = 208–2121 K. Likewise the ML Nonpolar Gradient Boosted can be applied over:  = 213–567 K;  = 0.0229–2.92 cP;  = 2–461 g mol−1;  = 12.5–96.3 bar; and  = 30–395 g mol−1. Both models showed good interpolation capability, however it is expected that they can also provide reasonable extrapolations.

The ML Polar Gradient Boosted and ML Nonpolar Gradient Boosted models are provided as a command line program in the [Supplementary Material](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#app1-materials-14-00542).

### 3.2. Detailed Comparison of ML Gradient Boosted and Classic Models

Four classic models for the calculation of diffusivities were adopted for comparison: two hydrodynamic equations (Wilke-Chang \[ [5](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B5-materials-14-00542)\] and Tyn-Calus \[ [7](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B7-materials-14-00542)\]), a correlation by Magalhães et al. \[ [9](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B9-materials-14-00542)\], and the hybrid model of Zhu et al. \[ [13](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B13-materials-14-00542)\]. The performance metrics of the classic models are shown in [Table 4](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#materials-14-00542-t004), for the polar systems, and [Table 5](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#materials-14-00542-t005), for the nonpolar systems. Overall, the proposed ML models outperform the classic models.

The Wilke-Chang and Tyn-Calus hydrodynamic equations provide similar performance indicators in both data sets, though the former shows much higher maximum AARDs ( [Table 4](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#materials-14-00542-t004): 197.71% vs. 97.11%; [Table 5](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#materials-14-00542-t005): 172.30% vs. 64.97%). Analyzing [Figure 5](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#materials-14-00542-f005) a,b, where the calculated _versus_ experimental diffusivities are plotted for the polar data set over the entire range and over a low range of values, we see that the Wilke-Chang equation overestimates higher diffusivities and tends to underestimate lower ones. The Tyn-Calus equation for polar solvents provides systematic underestimation as shown in [Figure S10 of the Supplementary Material](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#app1-materials-14-00542). In the case of nonpolar systems, both Wilke-Chang ( [Figure 6](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#materials-14-00542-f006) a,b) and Tyn-Calus ( [Figure S11](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#app1-materials-14-00542)) models exhibit a dual biased distribution of the calculated  values.

#### Figure 5.

[![Figure 5](https://cdn.ncbi.nlm.nih.gov/pmc/blobs/146a/7866074/41f054b5ee4f/materials-14-00542-g005a.jpg)](https://www.ncbi.nlm.nih.gov/core/lw/2.0/html/tileshop_pmc/tileshop_pmc_inline.html?title=Click%20on%20image%20to%20zoom&p=PMC3&id=7866074_materials-14-00542-g005a.jpg)

[![Figure 5](https://cdn.ncbi.nlm.nih.gov/pmc/blobs/146a/7866074/1ba7d03fe79c/materials-14-00542-g005b.jpg)](https://www.ncbi.nlm.nih.gov/core/lw/2.0/html/tileshop_pmc/tileshop_pmc_inline.html?title=Click%20on%20image%20to%20zoom&p=PMC3&id=7866074_materials-14-00542-g005b.jpg)

[Open in a new tab](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/figure/materials-14-00542-f005/)

Calculated _versus_ experimental diffusivities for the test set of polar systems for: ( **a**) and ( **b**) Wilke-Chang (Equation (1)) \[ [5](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B5-materials-14-00542)\] and ( **c**) and ( **d**) Magalhães et al. (Equation (4)) \[ [9](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B9-materials-14-00542)\] models. Note the distinct scale between plots.

#### Figure 6.

[![Figure 6](https://cdn.ncbi.nlm.nih.gov/pmc/blobs/146a/7866074/7d02a6dbd4e0/materials-14-00542-g006a.jpg)](https://www.ncbi.nlm.nih.gov/core/lw/2.0/html/tileshop_pmc/tileshop_pmc_inline.html?title=Click%20on%20image%20to%20zoom&p=PMC3&id=7866074_materials-14-00542-g006a.jpg)

[![Figure 6](https://cdn.ncbi.nlm.nih.gov/pmc/blobs/146a/7866074/cbc1341ba54b/materials-14-00542-g006b.jpg)](https://www.ncbi.nlm.nih.gov/core/lw/2.0/html/tileshop_pmc/tileshop_pmc_inline.html?title=Click%20on%20image%20to%20zoom&p=PMC3&id=7866074_materials-14-00542-g006b.jpg)

[Open in a new tab](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/figure/materials-14-00542-f006/)

Calculated _versus_ experimental diffusivities for the test set of nonpolar systems for: ( **a**) and ( **b**) Wilke-Chang (Equation (1)) \[ [5](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B5-materials-14-00542)\] and ( **c**) and ( **d**) Magalhães et al. (Equation (4)) \[ [9](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B9-materials-14-00542)\] models. Note the distinct scale between plots.

The correlation of Magalhães et al. is able to deliver the best performance among the classic models, with a unbiased distribution along the diagonal in [Figure 5](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#materials-14-00542-f005) c,d and [Figure 6](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#materials-14-00542-f006) c,d and an AARD only slightly above that provided by the machine learning gradient boosted models proposed in this work (5.19% and 6.19% for the polar and nonpolar sets, respectively). However, the Magalhães et al. can often be difficult to apply since it requires that data on the system of interest is available in order to fit its two parameters. In this work, data in the train sets was used to fit the  and  parameters for each system, which were then applied to the calculation of diffusivities for the test sets. For this reason, fewer points were calculated for the Magalhães et al. model, corresponding to the systems where not enough data were available in the train sets to optimize parameters  and .

Finally, the Zhu et al. model, which was developed for nonpolar and weakly polar fluids, does not appear to provide any benefit over the much simpler Wilke-Chang and Tyn-Calus equations when applied to the nonpolar data set of this work. It provides higher AARD ( [Table 5](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#materials-14-00542-t005): 37.93%) than both hydrodynamic equations ( [Table 5](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#materials-14-00542-t005): 29.19% and 28.84%, respectively), although it shows lower biased dispersion along diagonal ( [Figure S12](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#app1-materials-14-00542)).

[Table 6](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#materials-14-00542-t006) details the results of the best machine learning (gradient boosted) and classic diffusivity models for each system of the polar database, as well as the distribution of points among train and test sets. The best results are found for the ethylbenzene/acetone system (AARD of 0.08%) and the worst for the ethylene glycol/ethanol system (76.23%). However, these two systems have only one and two points in the test set, respectively. Considering only cases where at least 10 points are available for train and test sets, the carbon dioxide/n-butanol shows the best result (1.19%) while ammonia/1-propanol has the worst (5.65%).

#### Table 6.

Calculated deviations of the individual systems of the polar database (divided into test and train sets) achieved by the best machine learning model of this work (Gradient Boosted) and classic equations adopted for comparison.

|  |  | NDP | AARD (%) | Data Ref. |
| :-: | :-: | :-: | :-: | :-: |
|  |  | ML Gradient Boosted | Wilke-Chang | Tyn-Calus | Magalhães et al. |
| :-: | :-: | :-: | :-: | :-: | :-: |
| Solvent | Solute | Total | Test | Train | Test | Train | Test | Train | Test | Train | Test | Train |
| :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| 1-propanol | ammonia | 31 | 14 | 17 | 5.65 | 0.60 | 33.93 | 31.25 | 19.49 | 21.11 | 4.53 | 2.23 | \[ [71](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B71-materials-14-00542)\] |
| 1-propanol | carbon dioxide | 27 | 11 | 16 | 1.74 | 0.69 | 54.34 | 57.12 | 71.29 | 73.03 | 3.57 | 2.73 | \[ [71](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B71-materials-14-00542)\] |
| 1-propanol | propane | 36 | 9 | 27 | 4.04 | 0.87 | 48.26 | 53.11 | 62.76 | 66.25 | 4.84 | 4.87 | \[ [71](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B71-materials-14-00542)\] |
| 1-propanol | propene | 36 | 12 | 24 | 2.66 | 1.22 | 51.82 | 56.37 | 66.01 | 69.22 | 3.84 | 4.81 | \[ [71](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B71-materials-14-00542)\] |
| 1-propanol | water | 5 | 2 | 3 | 38.77 | 0.16 | 153.58 | 119.30 | 46.19 | 26.42 | 18.77 | 0.93 | \[ [72](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B72-materials-14-00542)\] |
| 2-propanol | benzene | 10 | 2 | 8 | 1.61 | 0.18 | 19.82 | 8.26 | 35.37 | 26.16 | 28.53 | 6.52 | \[ [73](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B73-materials-14-00542)\] |
| 2-propanol | naphthalene | 10 | 3 | 7 | 0.93 | 0.23 | 7.64 | 13.02 | 24.72 | 24.05 | 9.06 | 10.74 | \[ [73](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B73-materials-14-00542)\] |
| 2-propanol | _n_-decane | 10 | 3 | 7 | 0.74 | 0.20 | 11.68 | 20.45 | 23.09 | 30.72 | 3.81 | 15.80 | \[ [73](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B73-materials-14-00542)\] |
| 2-propanol | _n_-tetradecane | 9 | 5 | 4 | 6.36 | 0.72 | 15.44 | 14.88 | 20.85 | 21.60 | 24.45 | 2.49 | \[ [73](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B73-materials-14-00542)\] |
| 2-propanol | phenanthrene | 9 | 3 | 6 | 10.06 | 0.46 | 23.85 | 5.46 | 34.66 | 13.53 | 92.77 | 1.72 | \[ [73](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B73-materials-14-00542)\] |
| 2-propanol | toluene | 10 | 1 | 9 | 7.16 | 0.19 | 18.91 | 9.87 | 36.94 | 26.77 | 13.69 | 8.03 | \[ [73](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B73-materials-14-00542)\] |
| 2-propanol | water | 5 | 1 | 4 | 41.12 | 0.44 | 130.88 | 143.02 | 33.10 | 40.10 | 4.57 | 0.83 | \[ [72](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B72-materials-14-00542)\] |
| acetone | 1,2,4-trichlorobenzene | 6 | 2 | 4 | 5.85 | 0.48 | 10.53 | 11.95 | 27.10 | 28.26 | 3.59 | 1.08 | \[ [74](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B74-materials-14-00542)\] |
| acetone | 1,3,5-trimethylbenzene | 5 | 2 | 3 | 0.75 | 0.06 | 18.81 | 19.10 | 32.77 | 33.01 | 0.15 | 0.61 | \[ [74](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B74-materials-14-00542)\] |
| acetone | benzene | 6 |  | 6 |  | 0.19 |  | 13.32 |  | 34.40 |  | 0.36 | \[ [74](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B74-materials-14-00542)\] |
| acetone | biphenyl | 6 | 1 | 5 | 4.35 | 0.63 | 18.79 | 18.79 | 30.99 | 30.99 | 0.46 | 0.40 | \[ [74](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B74-materials-14-00542)\] |
| acetone | chlorobenzene | 6 |  | 6 |  | 0.14 |  | 13.57 |  | 32.58 |  | 0.85 | \[ [74](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B74-materials-14-00542)\] |
| acetone | ethylbenzene | 6 | 1 | 5 | 0.08 | 0.23 | 18.76 | 19.07 | 34.44 | 34.68 | 0.17 | 0.43 | \[ [74](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B74-materials-14-00542)\] |
| acetone | naphthalene | 5 |  | 5 |  | 0.28 |  | 18.33 |  | 32.93 |  | 0.42 | \[ [74](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B74-materials-14-00542)\] |
| acetone | _n_-propylbenzene | 5 | 4 | 1 | 0.98 | 0.00 | 21.09 | 21.14 | 34.47 | 34.52 |  |  | \[ [74](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B74-materials-14-00542)\] |
| acetone | toluene | 5 |  | 5 |  | 0.12 |  | 16.89 |  | 34.87 |  | 0.38 | \[ [74](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B74-materials-14-00542)\] |
| acetone | water | 4 | 1 | 3 | 5.94 | 0.06 | 83.53 | 85.64 | 6.60 | 7.82 | 0.80 | 0.87 | \[ [75](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B75-materials-14-00542)\] |
| acetonitrile | \[Bmim\]\[bti\] | 5 | 1 | 4 | 2.19 | 0.51 | 50.27 | 49.10 | 48.63 | 47.43 | 0.60 | 1.19 | \[ [76](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B76-materials-14-00542)\] |
| acetonitrile | \[Emim\]\[bti\] | 5 | 1 | 4 | 1.63 | 0.02 | 47.83 | 46.64 | 47.25 | 46.06 | 1.10 | 1.35 | \[ [76](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B76-materials-14-00542)\] |
| acetonitrile | \[Hmim\]\[bti\] | 5 |  | 5 |  | 0.29 |  | 48.77 |  | 46.06 |  | 1.94 | \[ [76](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B76-materials-14-00542)\] |
| acetonitrile | \[Omim\]\[bti\] | 5 | 1 | 4 | 1.12 | 0.26 | 48.99 | 49.22 | 45.36 | 45.61 | 0.18 | 1.04 | \[ [76](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B76-materials-14-00542)\] |
| acetonitrile | carbon disulfide | 5 | 3 | 2 | 16.39 | 3.76 | 22.64 | 28.64 | 41.91 | 46.42 | 10.72 |  | \[ [77](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B77-materials-14-00542)\] |
| acetonitrile | methanol | 20 | 6 | 14 | 6.49 | 0.96 | 20.28 | 15.79 | 43.25 | 40.05 | 1.44 | 1.78 | \[ [77](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B77-materials-14-00542)\] |
| chlorobenzene | propene | 32 | 9 | 23 | 0.95 | 0.25 | 9.43 | 9.88 | 32.77 | 32.49 | 1.01 | 1.12 | \[ [78](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B78-materials-14-00542), [79](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B79-materials-14-00542)\] |
| chlorotrifluoromethane | 1,3-dibromobenzene | 12 | 3 | 9 | 9.31 | 1.21 | 147.23 | 148.48 | 75.18 | 76.06 | 6.85 | 4.14 | \[ [80](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B80-materials-14-00542)\] |
| chlorotrifluoromethane | acetone | 10 | 2 | 8 | 16.17 | 0.78 | 93.87 | 93.66 | 24.18 | 24.05 | 8.00 | 3.55 | \[ [80](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B80-materials-14-00542)\] |
| chlorotrifluoromethane | _p_-xylene | 8 | 1 | 7 | 7.05 | 0.65 | 75.61 | 98.40 | 24.84 | 41.04 | 2.31 | 3.68 | \[ [80](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B80-materials-14-00542)\] |
| deuterium oxide | oxygen | 18 | 7 | 11 | 5.43 | 0.27 | 20.33 | 16.57 | 38.87 | 35.99 | 4.64 | 7.55 | \[ [81](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B81-materials-14-00542)\] |
| ethanol | 1,2-butanediol | 5 | 2 | 3 | 37.20 | 1.27 | 30.65 | 27.41 | 13.27 | 15.42 | 2.61 | 0.24 | \[ [82](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B82-materials-14-00542)\] |
| ethanol | 1,3,5-trimethylbenzene | 13 | 5 | 8 | 4.09 | 0.54 | 13.22 | 18.95 | 21.13 | 19.42 | 1.65 | 1.92 | \[ [83](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B83-materials-14-00542)\] |
| ethanol | 1,4-butanediol | 4 | 4 |  | 63.79 |  | 48.40 |  | 2.88 |  |  |  | \[ [82](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B82-materials-14-00542)\] |
| ethanol | 1-butanol | 4 | 3 | 1 | 20.44 | 3.64 | 17.25 | 17.95 | 22.96 | 22.49 |  |  | \[ [82](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B82-materials-14-00542)\] |
| ethanol | 2-phenylethyl acetate | 15 | 4 | 11 | 2.64 | 1.38 | 16.89 | 17.80 | 38.86 | 39.53 | 2.98 | 1.97 | \[ [84](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B84-materials-14-00542)\] |
| ethanol | 3-phenylpropyl acetate | 15 | 3 | 12 | 2.59 | 0.91 | 14.30 | 13.49 | 35.82 | 35.21 | 3.93 | 1.76 | \[ [84](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B84-materials-14-00542)\] |
| ethanol | ammonia | 18 | 5 | 13 | 3.84 | 2.00 | 36.24 | 42.92 | 29.11 | 25.63 | 5.32 | 3.18 | \[ [71](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B71-materials-14-00542)\] |
| ethanol | benzene | 21 | 8 | 13 | 3.42 | 1.16 | 27.35 | 24.37 | 25.74 | 35.54 | 6.16 | 12.16 | \[ [82](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B82-materials-14-00542), [83](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B83-materials-14-00542)\] |
| ethanol | benzonitrile | 16 | 8 | 8 | 1.86 | 0.97 | 24.97 | 25.34 | 48.86 | 49.11 | 0.83 | 1.02 | \[ [85](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B85-materials-14-00542)\] |
| ethanol | benzyl acetate | 15 | 5 | 10 | 4.43 | 0.98 | 17.97 | 13.93 | 41.27 | 38.38 | 3.36 | 2.89 | \[ [84](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B84-materials-14-00542)\] |
| ethanol | carbon dioxide | 27 | 9 | 18 | 4.82 | 2.21 | 49.74 | 46.56 | 72.64 | 70.90 | 5.08 | 3.73 | \[ [71](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B71-materials-14-00542)\] |
| ethanol | chromium(III) acetylacetonate | 9 | 1 | 8 | 7.17 | 0.77 | 20.79 | 16.81 | 8.31 | 11.33 | 2.99 | 2.24 | \[ [86](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B86-materials-14-00542), [87](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B87-materials-14-00542)\] |
| ethanol | dibenzyl ether | 15 | 5 | 10 | 3.00 | 1.52 | 22.47 | 25.90 | 41.47 | 44.06 | 4.26 | 1.37 | \[ [84](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B84-materials-14-00542)\] |
| ethanol | disperse blue 14 | 8 | 2 | 6 | 2.75 | 5.23 | 22.10 | 22.73 | 38.77 | 39.26 | 5.61 | 10.24 | \[ [88](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B88-materials-14-00542)\] |
| ethanol | disperse orange 11 | 12 | 2 | 10 | 0.44 | 0.17 | 20.42 | 15.17 | 38.89 | 34.86 | 6.15 | 2.75 | \[ [88](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B88-materials-14-00542)\] |
| ethanol | ethylene glycol | 5 | 2 | 3 | 76.23 | 0.05 | 61.03 | 57.90 | 4.28 | 2.65 | 5.06 | 1.36 | \[ [82](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B82-materials-14-00542)\] |
| ethanol | eucalyptol | 12 | 4 | 8 | 7.02 | 1.06 | 10.58 | 13.85 | 34.55 | 36.94 | 0.48 | 0.65 | \[ [56](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B56-materials-14-00542)\] |
| ethanol | gallic acid | 24 | 5 | 19 | 5.14 | 0.61 | 134.06 | 132.71 | 53.92 | 53.04 | 1.57 | 0.79 | \[ [57](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B57-materials-14-00542)\] |
| ethanol | glycerol | 5 |  | 5 |  | 1.08 |  | 52.51 |  | 4.59 |  | 3.28 | \[ [82](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B82-materials-14-00542)\] |
| ethanol | Ibuprofen | 16 | 7 | 9 | 4.87 | 1.07 | 4.97 | 5.51 | 19.05 | 18.63 | 0.92 | 0.81 | \[ [89](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B89-materials-14-00542)\] |
| ethanol | naphthalene | 13 | 2 | 11 | 8.86 | 0.16 | 21.43 | 14.25 | 30.88 | 20.36 | 11.33 | 1.13 | \[ [83](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B83-materials-14-00542)\] |
| ethanol | nitrous oxide | 5 |  | 5 |  | 0.26 |  | 44.94 |  | 69.83 |  | 0.68 | \[ [90](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B90-materials-14-00542)\] |
| ethanol | palladium(II) acetylacetonate | 4 | 1 | 3 | 4.84 | 0.03 | 15.52 | 18.85 | 17.74 | 15.36 | 0.67 | 0.80 | \[ [87](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B87-materials-14-00542)\] |
| ethanol | phenanthrene | 13 | 2 | 11 | 11.23 | 0.06 | 4.25 | 11.34 | 22.56 | 17.30 | 2.83 | 1.26 | \[ [83](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B83-materials-14-00542)\] |
| ethanol | phenylbutazone | 8 | 1 | 7 | 7.87 | 2.02 | 10.27 | 10.72 | 10.26 | 9.89 | 2.01 | 2.13 | \[ [91](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B91-materials-14-00542)\] |
| ethanol | propane | 30 | 7 | 23 | 4.31 | 1.93 | 43.06 | 42.56 | 64.52 | 64.21 | 7.48 | 8.90 | \[ [71](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B71-materials-14-00542)\] |
| ethanol | propene | 30 | 5 | 25 | 1.78 | 1.52 | 43.30 | 45.74 | 65.37 | 66.86 | 7.80 | 7.72 | \[ [71](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B71-materials-14-00542)\] |
| ethanol | quercetin | 16 | 6 | 10 | 7.15 | 1.79 | 40.58 | 40.59 | 9.60 | 9.61 | 0.86 | 1.11 | \[ [92](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B92-materials-14-00542)\] |
| ethanol | toluene | 14 | 7 | 7 | 5.02 | 0.12 | 20.45 | 17.54 | 24.14 | 20.86 | 8.93 | 0.70 | \[ [83](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B83-materials-14-00542)\] |
| ethanol | water | 15 | 2 | 13 | 15.26 | 0.90 | 131.04 | 145.20 | 15.31 | 22.37 | 4.86 | 4.30 | \[ [75](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B75-materials-14-00542), [82](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B82-materials-14-00542), [93](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B93-materials-14-00542)\] |
| ethyl acetate | astaxanthin | 12 | 5 | 7 | 1.50 | 0.56 | 11.44 | 14.29 | 8.83 | 11.61 | 1.51 | 2.85 | \[ [94](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B94-materials-14-00542)\] |
| ethyl acetate | quercetin | 16 | 4 | 12 | 2.90 | 0.52 | 44.69 | 50.17 | 19.78 | 24.31 | 3.18 | 1.80 | \[ [92](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B92-materials-14-00542)\] |
| ethyl acetate | squalene | 12 | 2 | 10 | 2.01 | 0.57 | 7.70 | 8.86 | 12.34 | 13.44 | 1.54 | 0.98 | \[ [94](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B94-materials-14-00542)\] |
| ethylene glycol | propene | 31 | 9 | 22 | 1.36 | 0.86 | 48.94 | 48.81 | 64.24 | 64.14 | 1.41 | 1.70 | \[ [78](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B78-materials-14-00542), [79](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B79-materials-14-00542)\] |
| methanol | \[Bmim\]\[bti\] | 11 | 5 | 6 | 3.46 | 1.69 | 42.58 | 41.65 | 54.56 | 53.82 | 5.00 | 2.15 | \[ [76](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B76-materials-14-00542), [95](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B95-materials-14-00542)\] |
| methanol | \[Emim\]\[bti\] | 11 | 4 | 7 | 5.07 | 0.23 | 40.25 | 41.85 | 53.72 | 54.96 | 5.24 | 1.64 | \[ [76](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B76-materials-14-00542), [95](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B95-materials-14-00542)\] |
| methanol | \[Hmim\]\[bti\] | 5 | 2 | 3 | 4.25 | 0.54 | 36.57 | 39.04 | 48.83 | 50.82 | 3.91 | 0.74 | \[ [76](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B76-materials-14-00542)\] |
| methanol | \[Omim\]\[bti\] | 5 |  | 5 |  | 0.61 |  | 39.02 |  | 49.96 |  | 1.33 | \[ [76](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B76-materials-14-00542)\] |
| methanol | 1,3,5-trimethylbenzene | 4 |  | 4 |  | 1.15 |  | 15.85 |  | 42.38 |  | 3.25 | \[ [73](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B73-materials-14-00542)\] |
| methanol | acetonitrile | 26 | 9 | 17 | 2.94 | 1.30 | 27.88 | 26.50 | 57.94 | 57.13 | 2.19 | 1.63 | \[ [77](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B77-materials-14-00542)\] |
| methanol | ammonia | 24 | 6 | 18 | 0.93 | 1.78 | 106.11 | 114.44 | 3.67 | 7.78 | 4.25 | 3.93 | \[ [71](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B71-materials-14-00542)\] |
| methanol | benzene | 4 | 1 | 3 | 2.79 | 0.55 | 1.88 | 12.49 | 38.59 | 45.23 | 3.28 | 4.28 | \[ [73](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B73-materials-14-00542)\] |
| methanol | carbon dioxide | 25 | 10 | 15 | 3.80 | 0.79 | 30.72 | 30.86 | 63.70 | 63.77 | 4.05 | 3.84 | \[ [71](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B71-materials-14-00542)\] |
| methanol | carbon monoxide | 8 | 1 | 7 | 4.88 | 0.52 | 23.36 | 14.78 | 59.89 | 55.02 | 8.75 | 3.60 | \[ [96](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B96-materials-14-00542)\] |
| methanol | disperse blue 14 | 8 | 2 | 6 | 3.70 | 0.59 | 57.69 | 51.97 | 67.99 | 63.66 | 8.22 | 1.11 | \[ [88](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B88-materials-14-00542)\] |
| methanol | disperse orange 11 | 16 | 5 | 11 | 2.65 | 0.26 | 51.25 | 52.71 | 63.97 | 65.05 | 3.01 | 1.96 | \[ [88](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B88-materials-14-00542)\] |
| methanol | naphthalene | 4 | 2 | 2 | 7.59 | 0.08 | 17.60 | 15.98 | 44.04 | 42.94 | 19.90 |  | \[ [73](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B73-materials-14-00542)\] |
| methanol | _p_-chloronitrobenzene | 18 | 7 | 11 | 1.47 | 0.60 | 22.46 | 22.66 | 46.93 | 47.06 | 1.08 | 1.07 | \[ [97](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B97-materials-14-00542)\] |
| methanol | phenanthrene | 4 | 1 | 3 | 13.71 | 0.48 | 12.15 | 21.29 | 37.19 | 43.73 | 4.44 | 3.14 | \[ [73](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B73-materials-14-00542)\] |
| methanol | propane | 27 | 11 | 16 | 2.14 | 1.50 | 24.08 | 27.00 | 54.47 | 56.22 | 2.43 | 2.45 | \[ [71](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B71-materials-14-00542)\] |
| methanol | toluene | 4 |  | 4 |  | 0.25 |  | 14.12 |  | 44.35 |  | 3.66 | \[ [73](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B73-materials-14-00542)\] |
| methanol | vitamin K3 | 4 |  | 4 |  | 0.45 |  | 25.59 |  | 47.09 |  | 0.45 | \[ [98](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B98-materials-14-00542)\] |
| methanol | water | 5 | 2 | 3 | 28.86 | 0.74 | 310.36 | 281.35 | 97.11 | 83.18 | 11.09 | 0.18 | \[ [99](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B99-materials-14-00542)\] |
| n-butanol | ammonia | 64 | 17 | 47 | 2.63 | 1.75 | 38.12 | 38.41 | 20.73 | 20.56 | 5.36 | 5.81 | \[ [71](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B71-materials-14-00542)\] |
| n-butanol | carbon dioxide | 66 | 19 | 47 | 1.19 | 1.06 | 47.26 | 45.51 | 68.33 | 67.28 | 5.98 | 6.27 | \[ [71](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B71-materials-14-00542)\] |
| n-butanol | propane | 98 | 33 | 65 | 1.86 | 1.51 | 49.70 | 49.52 | 65.43 | 65.31 | 2.58 | 3.15 | \[ [71](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B71-materials-14-00542)\] |
| n-butanol | propene | 135 | 45 | 90 | 2.83 | 1.66 | 50.48 | 48.53 | 66.64 | 65.33 | 5.15 | 3.90 | \[ [71](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B71-materials-14-00542)\] |

[Open in a new tab](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/table/materials-14-00542-t006/)

[Table 7](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#materials-14-00542-t007) presents equivalent information for the nonpolar systems. In this case, the _n_-decane/ _n_-dodecane and tetraethyltin/ _n_-decane systems show the best (0.03%) and worst (25.87%) results, respectively, but, once again, with only one point in the test set. If only systems with at least five points in the train and test sets are considered, the best result appears for 1,3,5-trimethylbenzene/ _n_-hexane (2.98%) and the worst for toluene/n-hexane (4.58%).

#### Table 7.

Calculated deviations of the individual systems of the nonpolar database (divided into test and train sets) achieved by the best machine learning model of this work (Gradient Boosted) and classic equations adopted for comparison.

| Solvent | Solute | NDP | AARD (%) | Data Ref. |
| :-: | :-: | :-: | :-: | :-: |
| ML Gradient<br> Boosted | Wilke-Chang | Tyn-Calus | Magalhães et al. | Zhu et al. |
| :-: | :-: | :-: | :-: | :-: |
| Total | Test | Train | Test | Train | Test | Train | Test | Train | Test | Train | Test | Train |  |
| :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| 2,2,4-trimethylpentane | 1,3,5-trimethylbenzene | 4 |  | 4 |  | 2.11 |  | 21.44 |  | 17.70 |  | 0.64 |  | 171.90 | \[ [100](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B100-materials-14-00542)\] |
| 2,2,4-trimethylpentane | benzene | 4 | 1 | 3 | 2.49 | 1.36 | 11.31 | 14.98 | 31.05 | 28.78 | 0.04 | 2.33 | 128.60 | 119.69 | \[ [100](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B100-materials-14-00542)\] |
| 2,2,4-trimethylpentane | ethylbenzene | 4 |  | 4 |  | 3.68 |  | 19.42 |  | 21.11 |  | 1.79 |  | 157.43 | \[ [100](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B100-materials-14-00542)\] |
| 2,2,4-trimethylpentane | _o_-xylene | 4 |  | 4 |  | 1.96 |  | 16.19 |  | 23.43 |  | 2.78 |  | 147.48 | \[ [100](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B100-materials-14-00542)\] |
| 2,2,4-trimethylpentane | _p_-xylene | 4 | 1 | 3 | 6.04 | 6.76 | 15.57 | 5.11 | 23.48 | 33.84 | 4.27 | 2.74 | 116.04 | 126.93 | \[ [100](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B100-materials-14-00542)\] |
| 2,2,4-trimethylpentane | toluene | 4 |  | 4 |  | 2.21 |  | 10.10 |  | 29.38 |  | 2.07 |  | 126.50 | \[ [100](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B100-materials-14-00542)\] |
| 2,3-dimethylbutane | benzene | 11 | 2 | 9 | 3.22 | 3.10 | 14.74 | 13.29 | 40.85 | 39.84 | 1.78 | 1.74 | 9.45 | 7.59 | \[ [101](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B101-materials-14-00542)\] |
| 2,3-dimethylbutane | naphthalene | 9 | 2 | 7 | 1.28 | 1.68 | 18.35 | 19.02 | 38.53 | 39.04 | 0.61 | 2.18 | 1.80 | 2.59 | \[ [101](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B101-materials-14-00542)\] |
| 2,3-dimethylbutane | phenanthrene | 11 | 2 | 9 | 0.65 | 0.63 | 20.75 | 20.51 | 37.19 | 36.99 | 2.44 | 1.63 | 2.39 | 5.87 | \[ [101](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B101-materials-14-00542)\] |
| 2,3-dimethylbutane | toluene | 10 | 2 | 8 | 2.52 | 3.36 | 15.89 | 17.53 | 39.58 | 40.75 | 2.84 | 2.17 | 4.97 | 4.77 | \[ [101](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B101-materials-14-00542)\] |
| cyclohexane | 1,1′-dimethylferrocene | 5 | 2 | 3 | 1.07 | 1.64 | 9.73 | 8.30 | 17.40 | 18.48 | 2.41 | 0.26 | 192.52 | 197.96 | \[ [102](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B102-materials-14-00542)\] |
| cyclohexane | 1,3,5-trimethylbenzene | 12 | 1 | 11 | 9.04 | 3.82 | 6.73 | 14.13 | 28.83 | 14.33 | 8.28 | 8.32 | 16.07 | 59.79 | \[ [103](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B103-materials-14-00542), [104](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B104-materials-14-00542)\] |
| cyclohexane | acetone | 4 | 2 | 2 | 2.31 | 0.01 | 20.96 | 19.77 | 46.91 | 46.10 | 0.96 |  | 106.99 | 92.31 | \[ [104](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B104-materials-14-00542)\] |
| cyclohexane | argon | 7 | 3 | 4 | 9.78 | 4.63 | 6.89 | 2.54 | 43.32 | 44.85 | 5.54 | 2.05 | 40.33 | 66.48 | \[ [105](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B105-materials-14-00542)\] |
| cyclohexane | benzene | 12 | 2 | 10 | 12.00 | 2.96 | 24.55 | 17.57 | 13.13 | 18.78 | 12.40 | 8.05 | 92.05 | 61.13 | \[ [104](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B104-materials-14-00542), [106](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B106-materials-14-00542)\] |
| cyclohexane | carbon tetrachloride | 7 | 2 | 5 | 0.50 | 1.02 | 15.04 | 23.35 | 18.88 | 13.02 | 3.28 | 0.96 | 53.23 | 103.63 | \[ [105](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B105-materials-14-00542)\] |
| cyclohexane | ethane | 5 | 1 | 4 | 13.53 | 1.23 | 3.43 | 2.22 | 34.57 | 37.18 | 0.29 | 1.23 | 183.33 | 86.88 | \[ [107](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B107-materials-14-00542)\] |
| cyclohexane | ethylene | 5 | 1 | 4 | 1.93 | 1.06 | 0.26 | 1.74 | 37.99 | 37.80 | 1.60 | 1.08 | 66.73 | 110.83 | \[ [107](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B107-materials-14-00542)\] |
| cyclohexane | ethylferrocene | 6 | 1 | 5 | 0.68 | 0.49 | 5.53 | 8.18 | 20.56 | 18.56 | 1.18 | 0.75 | 178.04 | 169.05 | \[ [102](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B102-materials-14-00542)\] |
| cyclohexane | ferrocene | 5 | 3 | 2 | 2.84 | 0.08 | 15.24 | 13.62 | 16.70 | 17.87 | 1.37 | 0.20 | 49.79 | 58.60 | \[ [102](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B102-materials-14-00542)\] |
| cyclohexane | krypton | 6 | 3 | 3 | 9.01 | 2.60 | 16.32 | 15.16 | 32.42 | 33.09 | 3.07 | 1.27 | 54.85 | 78.43 | \[ [105](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B105-materials-14-00542)\] |
| cyclohexane | methane | 6 | 4 | 2 | 13.80 | 0.41 | 9.74 | 9.08 | 46.78 | 46.39 | 7.63 |  | 49.30 | 22.59 | \[ [105](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B105-materials-14-00542)\] |
| cyclohexane | m-xylene | 4 |  | 4 |  | 1.01 |  | 21.96 |  | 41.90 |  | 1.29 |  | 94.56 | \[ [104](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B104-materials-14-00542)\] |
| cyclohexane | naphthalene | 12 | 4 | 8 | 10.33 | 3.64 | 14.64 | 10.87 | 14.91 | 18.18 | 9.98 | 6.90 | 41.94 | 39.98 | \[ [104](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B104-materials-14-00542), [106](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B106-materials-14-00542)\] |
| cyclohexane | phenanthrene | 8 | 3 | 5 | 5.64 | 1.43 | 4.82 | 4.27 | 19.02 | 23.03 | 4.82 | 2.49 | 4.34 | 7.53 | \[ [106](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B106-materials-14-00542)\] |
| cyclohexane | _p_-xylene | 8 |  | 8 |  | 2.31 |  | 4.13 |  | 28.00 |  | 3.63 |  | 28.67 | \[ [106](https://pmc.ncbi.nlm.nih.gov/articles/PMC7866074/#B106-materials-14-00542)\] |
| cyclohexane | tetrabutyltin | 7 | 2 | 5 | 10.03 | 1.38 | 20.87 | 25.56 | 7.51 | 9.58 | 3.79 | 1.64 | 11.64 | 14.39 | \[ [105](https://pmc.ncbi.
…[truncated]